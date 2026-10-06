#!/usr/bin/env node
// pr-loop-state — PR state collector for the loop-eng-zeile skill.
//
// Read-only by contract: it reads from GitHub and from the local state and never writes. The skill
// orchestrator is the only writer. State lives outside the tree, in
// ~/.claude/loop-eng-zeile/work/<owner>__<repo>/state/.
//
// Measured invariants the code depends on, which break silently if changed:
//  - `search` + `reviewThreads` are NEVER paginated: --paginate was measured blowing a 120 s
//    timeout. The price is a per-page cap, so every cap is compared with `totalCount` and a cut
//    becomes a `warnings[]` entry. A silent cut would read as "nothing to do".
//  - an outdated thread returns `line: null`; the live location is `originalLine`.
//  - `pushedDate` is deprecated and returns null; `committedDate` is the last-push proxy.
//  - `ci.yml` runs on every `pull_request`, any base, drafts included: a stacked PR HAS checks,
//    and the absence of checks is an anomaly, not a stack state.
//  - path-filtered jobs (`dorny/paths-filter`, the `Generators` workflow's `paths`) conclude
//    SKIPPED or never show up: that means "not applicable", neither failure nor pending.
//  - single maintainer, no review bot: a human review is NOT a precondition of `done-pending`.
//    `awaiting-review` only exists while a review request is pending (`reviewRequests`).
//  - the loop posts with the user's login, so the author cannot tell the user from the loop. The
//    `<!-- loop-eng-zeile -->` marker at the start of everything the loop publishes can.
//  - the repo's bots are preview deployments (vercel): informative, never actionable.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE_BRANCH = "main";
const LOOP_MARKER = "<!-- loop-eng-zeile -->";

const FAILING_CONCLUSIONS = new Set([
  "FAILURE",
  "ERROR",
  "TIMED_OUT",
  "CANCELLED",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
]);
const PENDING_CONCLUSIONS = new Set([
  null,
  "PENDING",
  "QUEUED",
  "IN_PROGRESS",
  "WAITING",
  "EXPECTED",
]);
const NOT_APPLICABLE_CONCLUSIONS = new Set(["SKIPPED", "NEUTRAL"]);
const SEARCH_PAGE_SIZE = 40;
const THREAD_PAGE_SIZE = 100;
const REVIEW_PAGE_SIZE = 40;
const CHECK_PAGE_SIZE = 40;
const COMMENT_PAGE_SIZE = 30;
const REQUEST_PAGE_SIZE = 10;
const MERGE_STATE_PAGE_SIZE = 200;
const GH_TIMEOUT_MS = 90_000;
const STATE_VERSION = 1;

// The verdict stored in the shard decides whether a thread leaves the queue or comes back:
//  - applied / stale-fixed -> handled and answered; it leaves unless a human replies afterwards.
//  - rebutted / indeterminate -> the human's move: still pending (blocks `done-pending`) but not
//    back in `live`, otherwise the loop would ask again every tick.
const TERMINAL_VERDICTS = new Set(["applied", "stale-fixed"]);
const AWAITING_REVIEWER_VERDICTS = new Set(["rebutted", "indeterminate"]);

const DEPLOY_BOT_RE = /^(vercel|netlify|github-actions)(\[bot\])?$/i;

const PRS_QUERY = `query($q:String!,$searchN:Int!,$threadN:Int!,$reviewN:Int!,$checkN:Int!,$commentN:Int!,$requestN:Int!){
  search(query:$q, type:ISSUE, first:$searchN){
    issueCount
    nodes{ ... on PullRequest{
      number title url isDraft baseRefName headRefName headRefOid
      reviewDecision mergeable updatedAt body
      author{ login }
      commits(last:1){ nodes{ commit{
        oid committedDate
        statusCheckRollup{ state contexts(first:$checkN){ totalCount nodes{
          __typename
          ... on CheckRun{ name conclusion status detailsUrl }
          ... on StatusContext{ context state targetUrl }
        } } }
      } } }
      reviewRequests(first:$requestN){ totalCount nodes{ requestedReviewer{
        __typename
        ... on User{ login }
        ... on Team{ slug }
      } } }
      reviewThreads(first:$threadN){ totalCount pageInfo{ hasNextPage } nodes{
        id isResolved isOutdated path line originalLine
        comments(first:1){ totalCount nodes{
          databaseId createdAt body author{ login __typename }
        } }
        replies: comments(last:1){ nodes{
          databaseId createdAt body author{ login __typename }
        } }
      } }
      reviews(last:$reviewN){ totalCount nodes{ state submittedAt body author{ login __typename } } }
      comments(last:$commentN){ totalCount nodes{
        databaseId createdAt body isMinimized author{ login __typename }
      } }
    } }
  }
}`;

function gh(args) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: GH_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function ghJson(args) {
  return JSON.parse(gh(args));
}

function parseArgs(argv) {
  const opts = {
    json: false,
    author: null,
    mine: true,
    prs: [],
    repo: null,
    state: null,
    limit: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") opts.json = true;
    else if (arg === "--author") {
      opts.author = argv[++i];
      opts.mine = false;
    } else if (arg === "--others") {
      opts.author = null;
      opts.mine = false;
    } else if (arg === "--pr") opts.prs.push(Number(argv[++i]));
    else if (arg === "--repo") opts.repo = argv[++i];
    else if (arg === "--state") opts.state = argv[++i];
    else if (arg === "--limit") opts.limit = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") opts.help = true;
    else throw new Error(`unknown flag: ${arg}`);
  }
  return opts;
}

function usage() {
  return [
    "pr-loop-state — PR state for loop-eng-zeile (read-only)",
    "",
    "usage: node <skill>/bin/pr-loop-state.mjs [--json] [--author <login>|--others]",
    "         [--pr <n>]... [--repo o/r] [--state <dir>] [--limit <n>]",
    "",
    "  (default)         open PRs of the authenticated user",
    "  --author <login>  open PRs of that author",
    "  --others          open PRs of any author except the user",
    "  --pr <n>          restrict to specific PRs (repeatable); missing ones go to requestedMissing",
    "  --state <dir>     sharded state directory.",
    "                    Default: ~/.claude/loop-eng-zeile/work/<owner>__<repo>/state/",
    `  --limit <n>       cap on fetched PRs (default ${SEARCH_PAGE_SIZE}); a cut becomes a warning`,
    "  --json            full JSON output (default: compact table)",
    "",
    "exit 0 = valid collection (empty included). exit 1 = failure; no JSON is emitted.",
    'Every page cap that cuts data shows up in warnings[] — empty never means "nothing to do".',
  ].join("\n");
}

function resolveRepo(explicit) {
  if (explicit) {
    const [owner, name] = explicit.split("/");
    if (!owner || !name) {
      throw new Error(`--repo expects owner/name, got "${explicit}"`);
    }
    return { owner, name, slug: explicit };
  }
  let view;
  try {
    view = ghJson(["repo", "view", "--json", "nameWithOwner"]);
  } catch {
    throw new Error(
      "not inside a git clone: pass the repository with --repo <owner>/<name>",
    );
  }
  const slug = view.nameWithOwner;
  const [owner, name] = slug.split("/");
  return { owner, name, slug };
}

function resolveLogin() {
  return gh(["api", "user", "--jq", ".login"]).trim();
}

function workDirFor(repo) {
  return join(
    homedir(),
    ".claude",
    "loop-eng-zeile",
    "work",
    `${repo.owner}__${repo.name}`,
  );
}

function buildSearchQuery({ slug, login, opts }) {
  const parts = [`repo:${slug}`, "is:pr", "is:open"];
  if (opts.mine) parts.push(`author:${login}`);
  else if (opts.author) parts.push(`author:${opts.author}`);
  else parts.push(`-author:${login}`);
  return parts.join(" ");
}

function fetchPullRequests(searchQuery, searchN) {
  const raw = gh([
    "api",
    "graphql",
    "-f",
    `query=${PRS_QUERY}`,
    "-f",
    `q=${searchQuery}`,
    "-F",
    `searchN=${searchN}`,
    "-F",
    `threadN=${THREAD_PAGE_SIZE}`,
    "-F",
    `reviewN=${REVIEW_PAGE_SIZE}`,
    "-F",
    `checkN=${CHECK_PAGE_SIZE}`,
    "-F",
    `commentN=${COMMENT_PAGE_SIZE}`,
    "-F",
    `requestN=${REQUEST_PAGE_SIZE}`,
  ]);
  const parsed = JSON.parse(raw);
  if (parsed.errors?.length) {
    throw new Error(
      `GraphQL: ${parsed.errors.map((e) => e.message).join("; ")}`,
    );
  }
  const search = parsed.data?.search ?? {};
  return {
    nodes: (search.nodes ?? []).filter(
      (node) => node && typeof node.number === "number",
    ),
    issueCount: search.issueCount ?? 0,
  };
}

function fetchMergeState(slug, numbers, warnings) {
  const byNumber = new Map();
  if (!numbers.length) return byNumber;
  const rows = ghJson([
    "pr",
    "list",
    "--repo",
    slug,
    "--state",
    "open",
    "--limit",
    String(MERGE_STATE_PAGE_SIZE),
    "--json",
    "number,mergeStateStatus,labels",
  ]);
  for (const row of rows) {
    byNumber.set(row.number, {
      mergeStateStatus: row.mergeStateStatus ?? "UNKNOWN",
      labels: (row.labels ?? []).map((l) => l.name),
    });
  }
  const missing = numbers.filter((number) => !byNumber.has(number));
  if (missing.length) {
    warnings.push({
      kind: "merge-state-missing",
      detail: `no mergeStateStatus for ${missing.join(", ")} (cap of ${MERGE_STATE_PAGE_SIZE} open PRs)`,
      impact: "conflict and stale-base cannot be detected on these PRs",
    });
  }
  return byNumber;
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

// Sharded state (`state/global.json` + `state/pr-<n>.json`): the lock is per PR, so each session
// writes only the shard of the PR it locked and never erases another session's record.
function loadState(explicitPath, workDir) {
  const state = {
    version: null,
    sources: [],
    threads: new Map(),
    comments: new Map(),
    lastSeenReview: new Map(),
    warnings: [],
  };
  const shardDir = explicitPath ?? join(workDir, "state");
  if (!existsSync(shardDir)) return state;
  if (!isDirectory(shardDir)) {
    state.warnings.push({
      kind: "state-unreadable",
      detail: `${shardDir} is not a directory`,
    });
    return state;
  }
  const readJson = (path) => {
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      state.warnings.push({
        kind: "state-unreadable",
        detail: `${path}: ${error.message}`,
      });
      return null;
    }
  };
  const global = join(shardDir, "global.json");
  if (existsSync(global)) {
    const parsed = readJson(global);
    if (parsed) {
      state.sources.push(global);
      state.version = parsed.version ?? null;
    }
  }
  const shards = readdirSync(shardDir).filter((name) =>
    /^pr-\d+\.json$/.test(name),
  );
  for (const file of shards) {
    const parsed = readJson(join(shardDir, file));
    if (!parsed) continue;
    state.sources.push(join(shardDir, file));
    const pr = String(parsed.pr ?? "");
    for (const [threadId, entry] of Object.entries(parsed.threads ?? {})) {
      state.threads.set(threadId, entry);
    }
    for (const [commentId, entry] of Object.entries(parsed.comments ?? {})) {
      state.comments.set(String(commentId), entry);
    }
    if (parsed.lastSeenReviewAt && pr) {
      state.lastSeenReview.set(pr, parsed.lastSeenReviewAt);
    }
  }
  if (state.version !== null && state.version > STATE_VERSION) {
    state.warnings.push({
      kind: "state-version",
      detail: `state version ${state.version} > supported ${STATE_VERSION} — update the collector before writing`,
    });
  }
  return state;
}

function isBot(author) {
  if (!author) return false;
  const login = author.login ?? "";
  return (
    author.__typename === "Bot" ||
    /\[bot\]$/.test(login) ||
    DEPLOY_BOT_RE.test(login)
  );
}

function fromLoop(body) {
  return (body ?? "").trimStart().startsWith(LOOP_MARKER);
}

function firstLine(body) {
  const text = (body ?? "").replace(LOOP_MARKER, "");
  const line =
    text.split("\n").find((candidate) => candidate.trim().length > 0) ?? "";
  return line.trim().slice(0, 160);
}

function decisionRefs(text) {
  return [
    ...new Set(
      [...(text ?? "").matchAll(/\bQ(\d{1,3})\b/g)].map((m) => `Q${m[1]}`),
    ),
  ];
}

// Zeile has no per-comment rule codes: the citable reference is the decision number (`Q109`) and
// severity is the docs/README.md emoji. Both may appear anywhere near the start of a comment, so
// the search covers the first 240 characters instead of being anchored.
function decisionsFrom(body) {
  return decisionRefs((body ?? "").slice(0, 240));
}

function severityFrom(body) {
  const head = (body ?? "").slice(0, 240);
  if (head.includes("🔴")) return "blocking";
  if (head.includes("🟡")) return "fix";
  if (head.includes("⚪")) return "suggestion";
  return null;
}

// Stages of docs/plano-execucao.md are cited in pt-BR ("etapa 20") in titles, branches and bodies.
function stagesFrom(text) {
  return [
    ...new Set(
      [...(text ?? "").matchAll(/\betapa\s*(\d{1,3})\b/gi)].map((m) =>
        Number(m[1]),
      ),
    ),
  ];
}

function summarizeChecks(commitNode, warnings, number) {
  const rollup = commitNode?.statusCheckRollup;
  const contexts = rollup?.contexts?.nodes ?? [];
  const summary = {
    state: rollup?.state ?? "NONE",
    failing: [],
    pending: [],
    passing: 0,
    skipped: 0,
    total: contexts.length,
  };
  for (const context of contexts) {
    if (context.__typename === "CheckRun") {
      const label = { name: context.name, url: context.detailsUrl };
      if (FAILING_CONCLUSIONS.has(context.conclusion)) {
        summary.failing.push(label);
      } else if (
        context.status !== "COMPLETED" ||
        PENDING_CONCLUSIONS.has(context.conclusion)
      ) {
        summary.pending.push(label);
      } else if (NOT_APPLICABLE_CONCLUSIONS.has(context.conclusion)) {
        summary.skipped += 1;
      } else {
        summary.passing += 1;
      }
    } else {
      const label = { name: context.context, url: context.targetUrl };
      if (context.state === "FAILURE" || context.state === "ERROR") {
        summary.failing.push(label);
      } else if (context.state === "PENDING" || context.state === "EXPECTED") {
        summary.pending.push(label);
      } else {
        summary.passing += 1;
      }
    }
  }
  const declared = rollup?.contexts?.totalCount ?? contexts.length;
  if (declared > contexts.length) {
    warnings.push({
      kind: "checks-truncated",
      pr: number,
      detail: `${declared} checks, ${contexts.length} read (cap ${CHECK_PAGE_SIZE})`,
      impact: "a failing check outside the page stays invisible",
    });
  }
  if (summary.failing.length) summary.verdict = "red";
  else if (summary.pending.length) summary.verdict = "pending";
  else if (summary.passing > 0) summary.verdict = "green";
  else summary.verdict = "none";
  return summary;
}

// Priority order: the first matching predicate wins. This list and the table in SKILL.md
// ("Máquina de estados por PR") are the same thing — a divergence is a defect.
const CLASSIFIERS = [
  ["ci-red", (pr) => pr.checks.failing.length > 0],
  [
    "conflict",
    (pr) => pr.mergeStateStatus === "DIRTY" || pr.mergeable === "CONFLICTING",
  ],
  [
    "needs-response",
    (pr) =>
      pr.live.length > 0 ||
      pr.topLevelLive.length > 0 ||
      pr.unseenReviewSincePush,
  ],
  ["needs-triage", (pr) => pr.triage.length > 0],
  ["stale-base", (pr) => pr.mergeStateStatus === "BEHIND"],
  ["ci-running", (pr) => pr.checks.verdict === "pending"],
  [
    "awaiting-review",
    (pr) => pr.pendingReviewRequests.length > 0 && !pr.reviewedSincePush,
  ],
  ["draft", (pr) => pr.isDraft],
  ["no-ci", (pr) => pr.checks.verdict === "none"],
  [
    "done-pending",
    (pr) => pr.unresolved === 0 && pr.checks.verdict === "green",
  ],
];

const STATE_ORDER = CLASSIFIERS.map(([name]) => name).concat("needs-attention");

function classify(pr) {
  for (const [name, predicate] of CLASSIFIERS) {
    if (predicate(pr)) return name;
  }
  return "needs-attention";
}

function buildThreads(node, state, login, warnings) {
  const declared = node.reviewThreads?.totalCount ?? 0;
  const nodes = node.reviewThreads?.nodes ?? [];
  if (node.reviewThreads?.pageInfo?.hasNextPage || declared > nodes.length) {
    warnings.push({
      kind: "threads-truncated",
      pr: node.number,
      detail: `${declared} threads, ${nodes.length} read (cap ${THREAD_PAGE_SIZE})`,
      impact: "a comment outside the page is not counted as live",
    });
  }
  return nodes.map((thread) => {
    const comment = thread.comments?.nodes?.[0] ?? null;
    const reply = thread.replies?.nodes?.[0] ?? null;
    const entry = state.threads.get(thread.id) ?? null;
    const last = reply ?? comment;
    const lastAt = last?.createdAt ?? null;
    const lastFromLoop = fromLoop(last?.body);
    // Only a HUMAN reply after the verdict reopens. The loop's own reply carries the user's login
    // and, without the marker, would reopen the thread it has just handled.
    const reopened = Boolean(
      entry?.at && lastAt && lastAt > entry.at && !lastFromLoop,
    );
    return {
      id: thread.id,
      path: thread.path,
      line: thread.line ?? thread.originalLine ?? null,
      isResolved: thread.isResolved,
      isOutdated: thread.isOutdated,
      verdict: entry?.verdict ?? null,
      verdictAt: entry?.at ?? null,
      reopened,
      handled: Boolean(
        entry && TERMINAL_VERDICTS.has(entry.verdict) && !reopened,
      ),
      awaitingReviewer: Boolean(
        entry && AWAITING_REVIEWER_VERDICTS.has(entry.verdict) && !reopened,
      ),
      author: comment?.author?.login ?? null,
      fromBot: isBot(comment?.author),
      fromLoop: fromLoop(comment?.body),
      fromMe: comment?.author?.login === login,
      commentId: comment?.databaseId ?? null,
      createdAt: comment?.createdAt ?? null,
      commentCount: thread.comments?.totalCount ?? 0,
      lastReplyAt: lastAt,
      lastReplyAuthor: last?.author?.login ?? null,
      lastReplyFromLoop: lastFromLoop,
      decisions: decisionsFrom(comment?.body),
      severity: severityFrom(comment?.body),
      excerpt: firstLine(comment?.body),
    };
  });
}

function buildTopLevel(node, state, warnings) {
  const declared = node.comments?.totalCount ?? 0;
  const nodes = node.comments?.nodes ?? [];
  if (declared > nodes.length) {
    warnings.push({
      kind: "comments-truncated",
      pr: node.number,
      detail: `${declared} top-level comments, ${nodes.length} read (cap ${COMMENT_PAGE_SIZE})`,
      impact: "an older top-level request may be left out",
    });
  }
  return nodes
    .filter((comment) => !comment.isMinimized && !fromLoop(comment.body))
    .map((comment) => {
      const entry = state.comments.get(String(comment.databaseId)) ?? null;
      return {
        commentId: comment.databaseId,
        author: comment.author?.login ?? null,
        fromBot: isBot(comment.author),
        createdAt: comment.createdAt,
        verdict: entry?.verdict ?? null,
        handled: Boolean(entry),
        decisions: decisionsFrom(comment.body),
        severity: severityFrom(comment.body),
        excerpt: firstLine(comment.body),
      };
    });
}

function buildPr(node, mergeInfo, state, login, warnings) {
  const commitNode = node.commits?.nodes?.[0]?.commit ?? null;
  const lastPushAt = commitNode?.committedDate ?? null;
  const threads = buildThreads(node, state, login, warnings);
  const topLevel = buildTopLevel(node, state, warnings);

  // A thread opened by the loop itself (a review published on someone else's PR) is not a
  // request addressed to the loop.
  const open = threads.filter(
    (thread) => !thread.isResolved && !thread.handled && !thread.fromLoop,
  );
  const live = open.filter(
    (thread) => !thread.isOutdated && !thread.awaitingReviewer,
  );
  const triage = open.filter(
    (thread) => thread.isOutdated && !thread.awaitingReviewer,
  );
  const awaitingReviewer = open.filter((thread) => thread.awaitingReviewer);

  const declaredReviews = node.reviews?.totalCount ?? 0;
  const reviewNodes = node.reviews?.nodes ?? [];
  if (declaredReviews > reviewNodes.length) {
    warnings.push({
      kind: "reviews-truncated",
      pr: node.number,
      detail: `${declaredReviews} reviews, ${reviewNodes.length} read (cap ${REVIEW_PAGE_SIZE})`,
      impact: "the last review date may be underestimated",
    });
  }
  const reviews = reviewNodes
    .filter((review) => review.submittedAt && !fromLoop(review.body))
    .map((review) => ({
      state: review.state,
      author: review.author?.login ?? null,
      fromBot: isBot(review.author),
      submittedAt: review.submittedAt,
      hasBody: Boolean((review.body ?? "").trim()),
    }));

  const lastReviewAt = reviews.reduce(
    (max, review) => (review.submittedAt > max ? review.submittedAt : max),
    "",
  );
  const seenReviewAt = state.lastSeenReview.get(String(node.number)) ?? "";
  const reviewedSincePush = Boolean(
    lastPushAt && lastReviewAt && lastReviewAt > lastPushAt,
  );
  const unseenReviewSincePush =
    reviewedSincePush && lastReviewAt > seenReviewAt;

  const pendingReviewRequests = (node.reviewRequests?.nodes ?? [])
    .map((request) => request.requestedReviewer)
    .filter(Boolean)
    .map((reviewer) => reviewer.login ?? `team:${reviewer.slug}`);

  const pr = {
    number: node.number,
    title: node.title,
    url: node.url,
    author: node.author?.login ?? null,
    isDraft: node.isDraft,
    baseRefName: node.baseRefName,
    headRefName: node.headRefName,
    headRefOid: node.headRefOid,
    reviewDecision: node.reviewDecision || null,
    mergeable: node.mergeable ?? "UNKNOWN",
    mergeStateStatus: mergeInfo?.mergeStateStatus ?? "UNKNOWN",
    labels: mergeInfo?.labels ?? [],
    stacked: node.baseRefName !== BASE_BRANCH,
    lastPushAt,
    lastReviewAt: lastReviewAt || null,
    lastSeenReviewAt: seenReviewAt || null,
    reviewedSincePush,
    unseenReviewSincePush,
    pendingReviewRequests,
    threadTotal: node.reviewThreads?.totalCount ?? threads.length,
    unresolved: open.length,
    checks: summarizeChecks(commitNode, warnings, node.number),
    stages: stagesFrom(
      `${node.title}\n${node.headRefName}\n${node.body ?? ""}`,
    ),
    decisions: decisionRefs(`${node.title}\n${node.body ?? ""}`),
    live,
    triage,
    awaitingReviewer,
    topLevel,
    topLevelLive: topLevel.filter(
      (comment) => !comment.fromBot && !comment.handled,
    ),
    threads,
    reviews,
  };
  pr.state = classify(pr);
  return pr;
}

function stackDepth(pr, byHead) {
  let depth = 0;
  let cursor = byHead.get(pr.baseRefName);
  const seen = new Set([pr.number]);
  while (cursor && !seen.has(cursor.number)) {
    seen.add(cursor.number);
    depth += 1;
    cursor = byHead.get(cursor.baseRefName);
  }
  return depth;
}

function truncate(text, size) {
  return text.length > size ? `${text.slice(0, size - 1)}~` : text;
}

function renderTable(report) {
  const lines = [];
  lines.push(
    `repo ${report.repo}   login ${report.login}   scope ${report.scope}   PRs ${report.prs.length}`,
  );
  lines.push("");
  lines.push(
    "  #     state           f base                live tri awt top tot  chk  stage  title",
  );
  for (const pr of report.prs) {
    const flags = [pr.isDraft ? "D" : "-", pr.stacked ? "S" : "-"].join("");
    let chk = "ok";
    if (pr.checks.failing.length) chk = `F${pr.checks.failing.length}`;
    else if (pr.checks.pending.length) chk = `P${pr.checks.pending.length}`;
    else if (pr.checks.verdict === "none") chk = "--";
    lines.push(
      [
        String(pr.number).padStart(5),
        pr.state.padEnd(15),
        flags,
        truncate(pr.baseRefName, 19).padEnd(19),
        String(pr.live.length).padStart(4),
        String(pr.triage.length).padStart(3),
        String(pr.awaitingReviewer.length).padStart(3),
        String(pr.topLevelLive.length).padStart(3),
        String(pr.threadTotal).padStart(3),
        chk.padStart(4),
        (pr.stages.join(",") || "-").padEnd(6),
        truncate(pr.title, 50),
      ].join(" "),
    );
  }
  lines.push("");
  lines.push(
    `flags: D=draft S=stacked (base != ${BASE_BRANCH}; CI still runs)`,
  );
  lines.push(
    "columns: live=actionable  tri=to triage  awt=awaiting reviewer  top=human top-level comment",
  );
  const { totals } = report;
  lines.push(
    `totals: live ${totals.live}  triage ${totals.triage}  awaiting ${totals.awaitingReviewer}` +
      `  top-level ${totals.topLevelLive}  open threads ${totals.unresolved}`,
  );
  for (const state of STATE_ORDER) {
    const numbers = report.prs
      .filter((pr) => pr.state === state)
      .map((pr) => pr.number);
    if (numbers.length)
      lines.push(`  ${state.padEnd(15)} ${numbers.join(", ")}`);
  }
  const withLive = report.prs.filter(
    (pr) => pr.live.length > 0 || pr.topLevelLive.length > 0,
  );
  if (withLive.length) {
    lines.push("");
    lines.push(
      "live (thread: isResolved=false AND isOutdated=false; top: human top-level comment):",
    );
    for (const pr of withLive) {
      for (const thread of pr.live) {
        const ref = thread.decisions.join(",") || "-";
        lines.push(
          `  #${pr.number} ${thread.path}:${thread.line ?? "?"} [${ref}] ${thread.author}: ${thread.excerpt}`,
        );
      }
      for (const comment of pr.topLevelLive) {
        const ref = comment.decisions.join(",") || "-";
        lines.push(
          `  #${pr.number} (top-level) [${ref}] ${comment.author}: ${comment.excerpt}`,
        );
      }
    }
  }
  if (report.requestedMissing.length) {
    lines.push("");
    lines.push(
      `requested PRs outside the open scope: ${report.requestedMissing.join(", ")}`,
    );
  }
  if (report.warnings.length) {
    lines.push("");
    lines.push(
      'warnings (data cut or unavailable — empty here does NOT mean "nothing to do"):',
    );
    for (const warning of report.warnings) {
      const pr = warning.pr ? ` #${warning.pr}` : "";
      lines.push(`  ${warning.kind}${pr}: ${warning.detail}`);
    }
  }
  return lines.join("\n");
}

function scopeLabel(opts) {
  if (opts.mine) return "the user's PRs";
  return opts.author ? `PRs of ${opts.author}` : "PRs of other authors";
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const warnings = [];
  const repo = resolveRepo(opts.repo);
  const login = resolveLogin();
  const workDir = workDirFor(repo);
  const state = loadState(opts.state, workDir);
  warnings.push(...state.warnings);

  const searchQuery = buildSearchQuery({ slug: repo.slug, login, opts });
  const searchN = opts.limit ?? SEARCH_PAGE_SIZE;
  const { nodes, issueCount } = fetchPullRequests(searchQuery, searchN);
  if (issueCount > nodes.length) {
    warnings.push({
      kind: "search-truncated",
      detail: `${issueCount} PRs in scope, ${nodes.length} collected (cap ${searchN})`,
      impact:
        "an actionable PR may be outside the batch; raise --limit or narrow the scope",
    });
  }
  const mergeInfo = fetchMergeState(
    repo.slug,
    nodes.map((node) => node.number),
    warnings,
  );

  let prs = nodes.map((node) =>
    buildPr(node, mergeInfo.get(node.number), state, login, warnings),
  );
  // A requested PR outside the open set (merged, closed, other author) would come back as an
  // empty result, and empty reads as "nothing to do" for that PR.
  const requestedMissing = opts.prs.filter(
    (number) => !prs.some((pr) => pr.number === number),
  );
  if (opts.prs.length) {
    if (requestedMissing.length) {
      process.stderr.write(
        `pr-loop-state: outside the open scope of ${scopeLabel(opts)}: ${requestedMissing.join(", ")}\n`,
      );
    }
    prs = prs.filter((pr) => opts.prs.includes(pr.number));
  }

  const byHead = new Map(prs.map((pr) => [pr.headRefName, pr]));
  for (const pr of prs) {
    pr.stackParent = byHead.get(pr.baseRefName)?.number ?? null;
    pr.stackDepth = stackDepth(pr, byHead);
  }

  prs.sort((a, b) => {
    const byState = STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state);
    if (byState !== 0) return byState;
    if (a.stackDepth !== b.stackDepth) return a.stackDepth - b.stackDepth;
    return a.number - b.number;
  });

  const sum = (pick) => prs.reduce((total, pr) => total + pick(pr), 0);
  const report = {
    repo: repo.slug,
    login,
    baseBranch: BASE_BRANCH,
    scope: opts.mine
      ? "mine"
      : opts.author
        ? `author:${opts.author}`
        : "others",
    stateSources: state.sources,
    stateVersion: state.version,
    workDir,
    totals: {
      live: sum((pr) => pr.live.length),
      triage: sum((pr) => pr.triage.length),
      awaitingReviewer: sum((pr) => pr.awaitingReviewer.length),
      topLevelLive: sum((pr) => pr.topLevelLive.length),
      unresolved: sum((pr) => pr.unresolved),
    },
    requestedMissing,
    warnings,
    prs,
  };

  process.stdout.write(
    opts.json
      ? `${JSON.stringify(report, null, 2)}\n`
      : `${renderTable(report)}\n`,
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`pr-loop-state: ${error.message}\n`);
  process.exit(1);
}

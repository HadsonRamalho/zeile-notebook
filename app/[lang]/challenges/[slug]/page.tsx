"use client";

import {
  ArrowLeft,
  Clock,
  Cpu,
  Loader2,
  Play,
  RotateCcw,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { AmbientGlow } from "@/components/challenges/ambient-glow";
import { DifficultyBadge } from "@/components/challenges/difficulty-badge";
import { LeaderboardTable } from "@/components/challenges/leaderboard-table";
import { SolveEditor } from "@/components/challenges/solve-editor";
import { SubmissionResults } from "@/components/challenges/submission-results";
import { VerdictBadge } from "@/components/challenges/verdict-badge";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/api/auth-service";
import {
  getChallenge,
  getLeaderboard,
  getSubmission,
  listMySubmissions,
  pollSubmission,
  runSamples,
  submitSolution,
} from "@/lib/api/challenge-service";
import { languageLabel } from "@/lib/challenges/display";
import type { Language } from "@/lib/types";
import type {
  ChallengeDetail,
  LeaderboardEntry,
  SampleRunResult,
  SubmissionView,
} from "@/lib/types/challenge-types";
import type { User } from "@/lib/types/user-types";
import { cn } from "@/lib/utils";

type Tab = "statement" | "submissions" | "leaderboard";
type ResultView =
  | { kind: "samples"; data: SampleRunResult[]; compileError: string | null }
  | { kind: "submission"; data: SubmissionView }
  | null;

export default function SolveChallengePage() {
  const t = useTranslations("challenges");
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [detail, setDetail] = useState<ChallengeDetail | null | "notfound">(
    null,
  );
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>("statement");

  const [language, setLanguage] = useState<Language>("rust");
  const [codeByLang, setCodeByLang] = useState<Record<string, string>>({});

  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ResultView>(null);

  const [submissions, setSubmissions] = useState<SubmissionView[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(
    null,
  );

  const starterRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    getChallenge(slug)
      .then((data) => {
        if (!active) return;
        setDetail(data);
        const langs = data.challenge.languages;
        const initial = (langs[0] ?? "rust") as Language;
        const starter = data.challenge.starterCode ?? {};
        starterRef.current = starter;
        setLanguage(initial);
        setCodeByLang({ [initial]: starter[initial] ?? "" });
      })
      .catch(() => active && setDetail("notfound"));
    getProfile()
      .then((u) => active && setUser(u))
      .catch(() => active && setUser(null));
    return () => {
      active = false;
    };
  }, [slug]);

  const challenge = detail !== "notfound" && detail ? detail.challenge : null;

  const code = codeByLang[language] ?? "";
  const setCode = useCallback(
    (value: string) => setCodeByLang((prev) => ({ ...prev, [language]: value })),
    [language],
  );

  const handleLanguageChange = useCallback((next: Language) => {
    setLanguage(next);
    setCodeByLang((prev) =>
      next in prev
        ? prev
        : { ...prev, [next]: starterRef.current[next] ?? "" },
    );
  }, []);

  const resetCode = useCallback(() => {
    setCodeByLang((prev) => ({
      ...prev,
      [language]: starterRef.current[language] ?? "",
    }));
  }, [language]);

  const refreshMeta = useCallback(
    (challengeId: string) => {
      getLeaderboard(challengeId)
        .then(setLeaderboard)
        .catch(() => {});
      if (user) {
        listMySubmissions(challengeId)
          .then(setSubmissions)
          .catch(() => {});
      }
    },
    [user],
  );

  useEffect(() => {
    if (challenge) refreshMeta(challenge.id);
  }, [challenge, refreshMeta]);

  const handleRun = useCallback(async () => {
    if (!challenge || running || submitting) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await runSamples(challenge.id, { language, code });
      setResult({
        kind: "samples",
        data: res.results,
        compileError: res.compileError,
      });
    } catch {
      toast.error(t("authoring.error_generic"));
    } finally {
      setRunning(false);
    }
  }, [challenge, running, submitting, language, code, t]);

  const handleSubmit = useCallback(async () => {
    if (!challenge || submitting || running) return;
    if (!user) {
      toast.error(t("login_required"));
      return;
    }
    setSubmitting(true);
    try {
      const queued = await submitSolution(challenge.id, { language, code });
      setResult({ kind: "submission", data: queued });
      const final = await pollSubmission(queued.id, (s) =>
        setResult({ kind: "submission", data: s }),
      );
      setResult({ kind: "submission", data: final });
      refreshMeta(challenge.id);
    } catch {
      toast.error(t("authoring.error_generic"));
    } finally {
      setSubmitting(false);
    }
  }, [challenge, submitting, running, user, language, code, refreshMeta, t]);

  const openSubmission = useCallback(async (submissionId: string) => {
    try {
      const full = await getSubmission(submissionId);
      setResult({ kind: "submission", data: full });
    } catch {
      /* ignore */
    }
  }, []);

  if (detail === "notfound") {
    return (
      <div className="relative mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-3 p-8 text-center">
        <AmbientGlow />
        <h1 className="text-2xl font-bold">{t("not_found_title")}</h1>
        <p className="text-muted-foreground text-pretty">
          {t("not_found_description")}
        </p>
        <Link
          href="/challenges"
          className="mt-2 inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <ArrowLeft className="size-4" />
          {t("back_to_list")}
        </Link>
      </div>
    );
  }

  const busy = running || submitting;

  return (
    <div className="relative mx-auto w-full max-w-7xl space-y-6 p-4 pt-8 md:p-8">
      <AmbientGlow />

      <div className="space-y-4">
        <Link
          href="/challenges"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("back_to_list")}
        </Link>

        {challenge ? (
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-balance md:text-3xl">
                {challenge.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <DifficultyBadge difficulty={challenge.difficulty} />
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {t(`judge_mode.${challenge.judgeMode}`)}
                </span>
                {challenge.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5" />
                {challenge.timeLimitMs} ms
              </span>
              <span className="flex items-center gap-1.5">
                <Cpu className="size-3.5" />
                {Math.round(challenge.memLimitKb / 1024)} MB
              </span>
            </div>
          </div>
        ) : (
          <div className="h-9 w-2/3 animate-pulse rounded bg-muted" />
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: statement / submissions / leaderboard */}
        <div className="flex flex-col">
          <div className="mb-4 flex items-center gap-1 border-b border-border">
            {(
              [
                ["statement", t("tab_statement")],
                ["submissions", t("tab_submissions")],
                ["leaderboard", t("tab_leaderboard")],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  tab === key
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {!challenge ? (
            <div className="space-y-3">
              <div className="h-4 w-full animate-pulse rounded bg-muted" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
              <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
            </div>
          ) : tab === "statement" ? (
            <div className="space-y-6">
              <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-muted prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:before:content-none prose-code:after:content-none">
                <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
                  {challenge.statementMd}
                </Markdown>
              </div>

              {detail && <SampleTests tests={detail.sampleTests} />}
            </div>
          ) : tab === "submissions" ? (
            <SubmissionsList
              user={user}
              submissions={submissions}
              onOpen={openSubmission}
            />
          ) : (
            <div>
              {leaderboard === null ? (
                <div className="h-32 animate-pulse rounded-xl bg-muted" />
              ) : (
                <LeaderboardTable
                  entries={leaderboard}
                  currentUserId={user?.id}
                />
              )}
            </div>
          )}
        </div>

        {/* Right: editor + actions + result */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
          {challenge ? (
            <SolveEditor
              value={code}
              onChange={setCode}
              language={language}
              languages={challenge.languages}
              onLanguageChange={handleLanguageChange}
              readOnly={busy}
            />
          ) : (
            <div className="h-80 animate-pulse rounded-xl bg-muted" />
          )}

          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={resetCode}
              disabled={busy || !challenge}
            >
              <RotateCcw />
              {t("reset_code")}
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleRun}
                disabled={busy || !challenge}
              >
                {running ? <Loader2 className="animate-spin" /> : <Play />}
                {t("run_samples")}
              </Button>
              <Button onClick={handleSubmit} disabled={busy || !challenge}>
                {submitting ? <Loader2 className="animate-spin" /> : <Send />}
                {t("submit")}
              </Button>
            </div>
          </div>

          {!user && (
            <p className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {t("login_required")}
              <Link
                href="/login"
                className="font-medium text-primary hover:underline"
              >
                {t("login_cta")}
              </Link>
            </p>
          )}

          <ResultPanel result={result} />
        </div>
      </div>
    </div>
  );
}

function SampleTests({
  tests,
}: {
  tests: ChallengeDetail["sampleTests"];
}) {
  const t = useTranslations("challenges");
  if (tests.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t("no_samples")}</p>
    );
  }
  return (
    <div className="space-y-3">
      <h2 className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {t("samples_title")}
      </h2>
      <div className="space-y-3">
        {tests.map((test, index) => (
          <div
            key={test.id}
            className="overflow-hidden rounded-xl border border-border"
          >
            <div className="border-b border-border bg-muted/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {t("case_label", { n: index + 1 })}
            </div>
            <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <IoBlock label={t("sample_input")} value={test.input} />
              <IoBlock
                label={t("sample_expected")}
                value={test.expected ?? ""}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function IoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs text-foreground">
        {value || "—"}
      </pre>
    </div>
  );
}

function SubmissionsList({
  user,
  submissions,
  onOpen,
}: {
  user: User | null;
  submissions: SubmissionView[] | null;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("challenges");

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          {t("login_required")}
        </p>
        <Link
          href="/login"
          className="text-sm font-medium text-primary hover:underline"
        >
          {t("login_cta")}
        </Link>
      </div>
    );
  }

  if (submissions === null) {
    return <div className="h-32 animate-pulse rounded-xl bg-muted" />;
  }

  if (submissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
        <h3 className="text-lg font-semibold">{t("no_submissions_title")}</h3>
        <p className="max-w-sm text-sm text-muted-foreground text-pretty">
          {t("no_submissions_description")}
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {submissions.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            onClick={() => onOpen(s.id)}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {languageLabel(s.language)} ·{" "}
                {new Date(s.createdAt).toLocaleString()}
              </span>
              <span className="text-sm font-medium">
                {t(`status.${s.status}`)}
              </span>
            </div>
            {s.status === "done" && (
              <span className="font-mono text-sm text-foreground">
                {s.score}/{s.maxScore}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function ResultPanel({ result }: { result: ResultView }) {
  const t = useTranslations("challenges");
  if (!result) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {t("result_title")}
      </h2>
      {result.kind === "submission" ? (
        <SubmissionResults submission={result.data} />
      ) : (
        <SampleRunPanel
          results={result.data}
          compileError={result.compileError}
        />
      )}
    </div>
  );
}

function SampleRunPanel({
  results,
  compileError,
}: {
  results: SampleRunResult[];
  compileError: string | null;
}) {
  const t = useTranslations("challenges");

  if (compileError) {
    return (
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-destructive/20 bg-destructive/5 p-3 font-mono text-xs text-destructive">
        {compileError}
      </pre>
    );
  }

  const failed = results.filter((r) => r.verdict !== "AC" && r.verdict !== "SKIP")
    .length;

  return (
    <div className="space-y-3">
      <p
        className={cn(
          "text-sm font-medium",
          failed === 0 ? "text-primary" : "text-destructive",
        )}
      >
        {failed === 0
          ? t("samples_all_pass")
          : t("samples_some_fail", { failed, total: results.length })}
      </p>
      <div className="space-y-2">
        {results.map((r, i) => (
          <div key={i} className="rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("case_label", { n: i + 1 })}
              </span>
              <VerdictBadge verdict={r.verdict} />
            </div>
            <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <IoBlock label={t("sample_expected")} value={r.expected ?? ""} />
              <IoBlock label={t("output")} value={r.stderr || r.stdout} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

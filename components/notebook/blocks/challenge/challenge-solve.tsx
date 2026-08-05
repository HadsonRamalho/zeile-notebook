"use client";

import {
  Clock,
  Cpu,
  FileText,
  ListChecks,
  Loader2,
  Play,
  RotateCcw,
  Send,
  Trophy,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { LeaderboardTable } from "@/components/challenges/leaderboard-table";
import { SolveEditor } from "@/components/challenges/solve-editor";
import { SubmissionResults } from "@/components/challenges/submission-results";
import { VerdictBadge } from "@/components/challenges/verdict-badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/motion/tabs";
import { Button } from "@/components/ui/button";
import {
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
import { cn } from "@/lib/utils";

type Tab = "statement" | "submissions" | "leaderboard";
type ResultView =
  | { kind: "samples"; data: SampleRunResult[]; compileError: string | null }
  | { kind: "submission"; data: SubmissionView; showCode?: boolean }
  | null;

function parseDraft(raw?: string): {
  language?: string;
  byLang: Record<string, string>;
} {
  if (!raw) return { byLang: {} };
  try {
    const d = JSON.parse(raw);
    if (
      d &&
      typeof d === "object" &&
      d.byLang &&
      typeof d.byLang === "object"
    ) {
      return {
        language: typeof d.language === "string" ? d.language : undefined,
        byLang: d.byLang as Record<string, string>,
      };
    }
  } catch {}
  return { byLang: {} };
}

export function ChallengeSolve({
  detail,
  currentUserId,
  canReview = false,
  initialContent,
  onPersist,
}: {
  detail: ChallengeDetail;
  currentUserId?: string | null;
  canReview?: boolean;
  initialContent?: string;
  onPersist?: (content: string) => void;
}) {
  const t = useTranslations("challenges");
  const challenge = detail.challenge;

  const draftRef = useRef(parseDraft(initialContent));

  const [tab, setTab] = useState<Tab>("statement");
  const [language, setLanguage] = useState<Language>(
    (draftRef.current.language ?? challenge.languages[0] ?? "rust") as Language,
  );
  const [codeByLang, setCodeByLang] = useState<Record<string, string>>(
    () => draftRef.current.byLang,
  );
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ResultView>(null);
  const [submissions, setSubmissions] = useState<SubmissionView[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(
    null,
  );

  const starter = useRef(challenge.starterCode ?? {});
  const code = codeByLang[language] ?? "";
  const busy = running || submitting;

  const setCode = useCallback(
    (v: string) => setCodeByLang((p) => ({ ...p, [language]: v })),
    [language],
  );

  const refreshMeta = useCallback(() => {
    getLeaderboard(challenge.id)
      .then(setLeaderboard)
      .catch(() => setLeaderboard([]));
    if (currentUserId) {
      listMySubmissions(challenge.id)
        .then(setSubmissions)
        .catch(() => setSubmissions([]));
    }
  }, [challenge.id, currentUserId]);

  useEffect(() => {
    refreshMeta();
  }, [refreshMeta]);

  const firstPersist = useRef(true);
  useEffect(() => {
    if (firstPersist.current) {
      firstPersist.current = false;
      return;
    }
    onPersist?.(JSON.stringify({ language, byLang: codeByLang }));
  }, [codeByLang, language, onPersist]);

  const handleLanguageChange = useCallback((next: Language) => {
    setLanguage(next);
    setCodeByLang((prev) =>
      next in prev ? prev : { ...prev, [next]: starter.current[next] ?? "" },
    );
  }, []);

  const resetCode = useCallback(() => {
    setCodeByLang((p) => ({
      ...p,
      [language]: starter.current[language] ?? "",
    }));
  }, [language]);

  const handleRun = useCallback(async () => {
    if (busy) return;
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
      toast.error(t("login_required"));
    } finally {
      setRunning(false);
    }
  }, [busy, challenge.id, language, code, t]);

  const handleSubmit = useCallback(async () => {
    if (busy) return;
    if (!currentUserId) {
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
      refreshMeta();
    } catch {
      toast.error(t("login_required"));
    } finally {
      setSubmitting(false);
    }
  }, [busy, currentUserId, challenge.id, language, code, refreshMeta, t]);

  const openSubmission = useCallback(
    async (id: string) => {
      try {
        const data = await getSubmission(id);
        setResult({ kind: "submission", data, showCode: true });
      } catch {
        toast.error(t("login_required"));
      }
    },
    [t],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock className="size-3.5" />
          {challenge.timeLimitMs} ms
        </span>
        <span className="flex items-center gap-1.5">
          <Cpu className="size-3.5" />
          {Math.round(challenge.memLimitKb / 1024)} MB
        </span>
      </div>

      <Tabs
        variant="underline"
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
      >
        <TabsList className="w-full justify-start">
          <TabsTrigger value="statement" className="gap-1.5">
            <FileText className="size-4" />
            {t("tab_statement")}
          </TabsTrigger>
          <TabsTrigger value="submissions" className="gap-1.5">
            <ListChecks className="size-4" />
            {t("tab_submissions")}
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="gap-1.5">
            <Trophy className="size-4" />
            {t("tab_leaderboard")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="statement" className="space-y-4">
          <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-muted prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:before:content-none prose-code:after:content-none">
            <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
              {challenge.statementMd}
            </Markdown>
          </div>
          {detail.sampleTests.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                {t("samples_title")}
              </h4>
              {detail.sampleTests.map((test, i) => (
                <div
                  key={test.id}
                  className="overflow-hidden rounded-lg border border-border"
                >
                  <div className="border-b border-border bg-muted/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t("case_label", { n: i + 1 })}
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
          )}
        </TabsContent>

        <TabsContent value="submissions">
          {submissions === null ? (
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
          ) : submissions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              {t("no_submissions_description")}
            </div>
          ) : (
            <ul className="space-y-2">
              {submissions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => openSubmission(s.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                      {languageLabel(s.language)} ·{" "}
                      {new Date(s.createdAt).toLocaleString()}
                    </span>
                    <span className="text-sm font-medium">
                      {t(`status.${s.status}`)}
                      {s.status === "done" && (
                        <span className="ml-2 font-mono text-muted-foreground">
                          {s.score}/{s.maxScore}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="leaderboard">
          {leaderboard === null ? (
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
          ) : (
            <LeaderboardTable
              entries={leaderboard}
              currentUserId={currentUserId}
              canReview={canReview}
              onSelect={openSubmission}
            />
          )}
        </TabsContent>
      </Tabs>

      <div className="space-y-3">
        <SolveEditor
          value={code}
          onChange={setCode}
          language={language}
          languages={challenge.languages}
          onLanguageChange={handleLanguageChange}
          readOnly={busy}
        />

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={resetCode}
            disabled={busy}
            className="w-full sm:w-auto"
          >
            <RotateCcw />
            {t("reset_code")}
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              variant="outline"
              onClick={handleRun}
              disabled={busy}
              className="w-full sm:w-auto"
            >
              {running ? <Loader2 className="animate-spin" /> : <Play />}
              {t("run_samples")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={busy}
              className="w-full sm:w-auto"
            >
              {submitting ? <Loader2 className="animate-spin" /> : <Send />}
              {t("submit")}
            </Button>
          </div>
        </div>

        {!currentUserId && (
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {t("login_required")}
          </p>
        )}

        {result && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h4 className="mb-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              {t("result_title")}
            </h4>
            {result.kind === "submission" ? (
              <div className="space-y-4">
                {result.showCode && result.data.code && (
                  <div className="overflow-hidden rounded-lg border border-border">
                    <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {languageLabel(result.data.language)}
                      </span>
                    </div>
                    <pre className="max-h-72 overflow-auto p-3 font-mono text-xs text-foreground">
                      {result.data.code}
                    </pre>
                  </div>
                )}
                <SubmissionResults submission={result.data} />
              </div>
            ) : (
              <SampleRunPanel
                results={result.data}
                compileError={result.compileError}
              />
            )}
          </div>
        )}
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
      <pre className="max-h-32 overflow-auto whitespace-pre-wrap font-mono text-xs text-foreground">
        {value || "—"}
      </pre>
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
  const failed = results.filter(
    (r) => r.verdict !== "AC" && r.verdict !== "SKIP",
  ).length;
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
  );
}

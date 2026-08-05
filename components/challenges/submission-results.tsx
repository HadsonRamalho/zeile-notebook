"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { isTerminalStatus } from "@/lib/challenges/display";
import type { SubmissionView } from "@/lib/types/challenge-types";
import { cn } from "@/lib/utils";
import { VerdictBadge } from "./verdict-badge";

function StatusPill({ status }: { status: SubmissionView["status"] }) {
  const t = useTranslations("challenges.status");
  const pending = !isTerminalStatus(status);
  const tone =
    status === "done"
      ? "border-primary/25 bg-primary/10 text-primary"
      : status === "compile_error" || status === "error"
        ? "border-destructive/25 bg-destructive/10 text-destructive"
        : "border-border bg-muted text-muted-foreground";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest",
        tone,
      )}
    >
      {pending && <Loader2 className="size-3 animate-spin" />}
      {t(status)}
    </span>
  );
}

function ScoreMeter({ score, max }: { score: number; max: number }) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            pct === 100 ? "bg-primary" : "bg-primary/70",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function SubmissionResults({
  submission,
  className,
}: {
  submission: SubmissionView;
  className?: string;
}) {
  const t = useTranslations("challenges");
  const terminal = isTerminalStatus(submission.status);
  const showScore = submission.status === "done";
  const showError =
    submission.errorMessage &&
    (submission.status === "compile_error" || submission.status === "error");

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StatusPill status={submission.status} />
        {showScore && (
          <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            <span>
              {t("score")}{" "}
              <span className="text-foreground">
                {submission.score}/{submission.maxScore}
              </span>
            </span>
            <span>
              {t("runtime")}{" "}
              <span className="text-foreground">{submission.runtimeMs} ms</span>
            </span>
          </div>
        )}
      </div>

      {showScore && (
        <ScoreMeter score={submission.score} max={submission.maxScore} />
      )}

      {showError && (
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-destructive/20 bg-destructive/5 p-3 font-mono text-xs text-destructive">
          {submission.errorMessage}
        </pre>
      )}

      {terminal && submission.results.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {submission.results.map((result, index) => (
            <li
              key={`${result.testCaseId ?? "hidden"}-${result.ord}`}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
            >
              <span className="truncate text-sm text-foreground">
                {result.isHidden
                  ? t("hidden_case", { n: index + 1 })
                  : t("case_label", { n: index + 1 })}
              </span>
              <span className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {result.runtimeMs} ms
                </span>
                <VerdictBadge verdict={result.verdict} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

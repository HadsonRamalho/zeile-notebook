"use client";

import { useTranslations } from "next-intl";
import { VERDICT_TONE_CLASSES, verdictTone } from "@/domain/challenges/display";
import { cn } from "@/lib/utils";
import type { Verdict } from "@/types/challenge-types";

export function VerdictBadge({
  verdict,
  className,
}: {
  verdict: Verdict;
  className?: string;
}) {
  const t = useTranslations("challenges.verdict");

  return (
    <span
      title={t(verdict)}
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest",
        VERDICT_TONE_CLASSES[verdictTone(verdict)],
        className,
      )}
    >
      {verdict}
    </span>
  );
}

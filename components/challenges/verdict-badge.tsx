"use client";

import { useTranslations } from "next-intl";
import { VERDICT_TONE_CLASSES, verdictTone } from "@/lib/challenges/display";
import type { Verdict } from "@/lib/types/challenge-types";
import { cn } from "@/lib/utils";

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

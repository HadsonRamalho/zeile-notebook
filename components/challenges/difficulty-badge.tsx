"use client";

import { useTranslations } from "next-intl";
import { DIFFICULTY_DOT, difficultyKey } from "@/domain/challenges/display";
import { cn } from "@/lib/utils";

export function DifficultyBadge({
  difficulty,
  className,
}: {
  difficulty: string;
  className?: string;
}) {
  const t = useTranslations("challenges.difficulty");
  const key = difficultyKey(difficulty);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DIFFICULTY_DOT[key])} />
      {t(key)}
    </span>
  );
}

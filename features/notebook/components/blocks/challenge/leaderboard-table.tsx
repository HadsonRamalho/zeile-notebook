"use client";

import { Crown, Trophy } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { LeaderboardEntry } from "@/types/challenge-types";

function displayName(name: string | undefined) {
  if (!name) return "";
  const at = name.indexOf("@");
  return at === -1 ? name : name.slice(0, at);
}

export function LeaderboardTable({
  entries,
  currentUserId,
  canReview = false,
  onSelect,
}: {
  entries: LeaderboardEntry[];
  currentUserId?: string | null | undefined;
  canReview?: boolean;
  onSelect?: ((submissionId: string) => void) | undefined;
}) {
  const t = useTranslations("challenges");

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-16 text-center">
        <Trophy className="mb-2 size-10 text-muted-foreground opacity-50" />
        <h3 className="text-lg font-semibold">
          {t("leaderboard_empty_title")}
        </h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          {t("leaderboard_empty_description")}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <th className="w-12 px-4 py-2.5 font-medium">
              {t("leaderboard_rank")}
            </th>
            <th className="px-4 py-2.5 font-medium">{t("leaderboard_user")}</th>
            <th className="px-4 py-2.5 text-right font-medium">
              {t("leaderboard_score")}
            </th>
            <th className="px-4 py-2.5 text-right font-medium">
              {t("leaderboard_time")}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => {
            const isMe =
              currentUserId != null && entry.userId === currentUserId;
            const reviewable = !!onSelect && (canReview || isMe);
            return (
              <tr
                key={entry.userId}
                onClick={
                  reviewable ? () => onSelect(entry.submissionId) : undefined
                }
                className={cn(
                  "border-b border-border last:border-0 transition-colors",
                  isMe ? "bg-primary/5" : "hover:bg-muted/40",
                  reviewable && "cursor-pointer",
                )}
              >
                <td className="px-4 py-3">
                  {index === 0 ? (
                    <Crown className="size-4 text-amber-500" />
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">
                      {index + 1}
                    </span>
                  )}
                </td>
                <td className="max-w-40 truncate px-4 py-3 font-medium">
                  {displayName(entry.authorName)}
                  {isMe && (
                    <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-primary">
                      you
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {entry.score}/{entry.maxScore}
                </td>
                <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                  {entry.runtimeMs} ms
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

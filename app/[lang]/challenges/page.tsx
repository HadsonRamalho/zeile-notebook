"use client";

import { Puzzle, Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { AmbientGlow } from "@/components/challenges/ambient-glow";
import { DifficultyBadge } from "@/components/challenges/difficulty-badge";
import { BackButton } from "@/components/interface/back-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listChallenges } from "@/lib/api/challenge-service";
import {
  CHALLENGE_LANGUAGES,
  type DifficultyKey,
  difficultyKey,
  languageLabel,
} from "@/lib/challenges/display";
import type { ChallengePublic } from "@/lib/types/challenge-types";
import { cn } from "@/lib/utils";

type DifficultyFilter = "all" | DifficultyKey;
type LanguageFilter = "all" | string;

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

function SkeletonCard() {
  return (
    <div className="h-40 animate-pulse rounded-xl border border-border bg-card">
      <div className="space-y-3 p-5">
        <div className="h-5 w-2/3 rounded bg-muted" />
        <div className="h-4 w-1/3 rounded bg-muted" />
        <div className="mt-6 flex gap-2">
          <div className="h-5 w-16 rounded-full bg-muted" />
          <div className="h-5 w-12 rounded-full bg-muted" />
        </div>
      </div>
    </div>
  );
}

export default function ChallengesPage() {
  const t = useTranslations("challenges");
  const [challenges, setChallenges] = useState<ChallengePublic[] | null>(null);
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("all");
  const [language, setLanguage] = useState<LanguageFilter>("all");

  useEffect(() => {
    let active = true;
    listChallenges()
      .then((data) => {
        if (active) setChallenges(data);
      })
      .catch(() => {
        if (active) setChallenges([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!challenges) return [];
    const q = query.trim().toLowerCase();
    return challenges.filter((c) => {
      if (difficulty !== "all" && difficultyKey(c.difficulty) !== difficulty)
        return false;
      if (language !== "all" && !(c.languages as string[]).includes(language))
        return false;
      if (q) {
        const haystack = `${c.title} ${c.tags.join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [challenges, query, difficulty, language]);

  const loading = challenges === null;
  const hasAny = (challenges?.length ?? 0) > 0;
  const hasActiveCriteria =
    query.trim() !== "" || difficulty !== "all" || language !== "all";

  return (
    <div className="relative mx-auto w-full max-w-300 space-y-8 p-4 pt-10 md:p-8">
      <AmbientGlow />

      <div className="flex flex-col gap-4 border-b pb-6 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
            <Puzzle className="h-8 w-8 text-primary" />
            {t("title")}
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground text-pretty">
            {t("description")}
          </p>
          <BackButton />
        </div>
      </div>

      {(hasAny || hasActiveCriteria) && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search_placeholder")}
              className="h-10 w-full rounded-full border border-border bg-card pl-9 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <FilterChip
              active={difficulty === "all"}
              onClick={() => setDifficulty("all")}
            >
              {t("filter_all")}
            </FilterChip>
            {(["easy", "medium", "hard"] as const).map((d) => (
              <FilterChip
                key={d}
                active={difficulty === d}
                onClick={() => setDifficulty(d)}
              >
                {t(`difficulty.${d}`)}
              </FilterChip>
            ))}
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <FilterChip
              active={language === "all"}
              onClick={() => setLanguage("all")}
            >
              {t("filter_all")}
            </FilterChip>
            {CHALLENGE_LANGUAGES.map((l) => (
              <FilterChip
                key={l}
                active={language === l}
                onClick={() => setLanguage(l)}
              >
                {languageLabel(l)}
              </FilterChip>
            ))}
          </div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {t("count", { count: filtered.length })}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholder estático de skeleton, sem identidade real por item
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-20 text-center">
          <Puzzle className="mb-4 h-12 w-12 text-muted-foreground opacity-50" />
          <h3 className="text-xl font-semibold">
            {hasActiveCriteria ? t("no_results_title") : t("empty_title")}
          </h3>
          <p className="mt-1 max-w-md text-muted-foreground text-pretty">
            {hasActiveCriteria
              ? t("no_results_description")
              : t("empty_description")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((challenge) => (
            <Link
              key={challenge.id}
              href={
                challenge.notebookId
                  ? `/notebook/${challenge.notebookId}`
                  : "/challenges"
              }
            >
              <Card className="group flex h-full flex-col justify-between transition-colors hover:border-primary/50 hover:bg-primary/5">
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="line-clamp-2 text-lg leading-snug transition-colors group-hover:text-primary">
                      {challenge.title}
                    </CardTitle>
                    <DifficultyBadge
                      difficulty={challenge.difficulty}
                      className="shrink-0"
                    />
                  </div>
                  {challenge.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {challenge.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </CardHeader>

                <CardContent className="flex items-center justify-between border-t pt-4">
                  <div className="flex flex-wrap gap-1.5">
                    {challenge.languages.map((l) => (
                      <span
                        key={l}
                        className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        {languageLabel(l)}
                      </span>
                    ))}
                  </div>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {t(`judge_mode.${challenge.judgeMode}`)}
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

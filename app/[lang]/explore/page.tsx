"use client";

import { BookSearch, Calendar, Search, User, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { BackButton } from "@/components/layout/back-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchPublicNotebooks } from "@/lib/api/notebook-service";
import { cn } from "@/lib/utils";
import type { PublicNotebookResponse } from "@/types/notebook-types";

type Filter = "all" | "personal" | "team";

function displayOwnerName(name: string | undefined) {
  if (!name) return "";
  const at = name.indexOf("@");
  return at === -1 ? name : name.slice(0, at);
}

function AmbientGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="animate-ambient-drift absolute -top-10 left-[8%] size-80 rounded-full bg-primary/15 blur-3xl md:size-96" />
      <div
        className="animate-ambient-drift absolute -top-16 right-[8%] size-72 rounded-full bg-accent-violet/15 blur-3xl md:size-80"
        style={{ animationDelay: "2s" }}
      />
    </div>
  );
}

function FilterButton({
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

export default function PublicNotebooksPage() {
  const t = useTranslations("public_notebooks");
  const [notebooks, setNotebooks] = useState<PublicNotebookResponse[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    const handle = setTimeout(() => {
      fetchPublicNotebooks(query).then((result) =>
        setNotebooks(result.isOk() ? result.data : []),
      );
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const filtered = useMemo(() => {
    return notebooks.filter((notebook) => {
      const isTeam = !!notebook.teamId;
      if (filter === "personal" && isTeam) return false;
      if (filter === "team" && !isTeam) return false;
      return true;
    });
  }, [notebooks, filter]);

  const hasActiveCriteria = query.trim() !== "" || filter !== "all";

  return (
    <div className="relative mx-auto w-full max-w-300 space-y-8 p-4 pt-10 md:p-8">
      <AmbientGlow />

      <div className="flex flex-col space-y-4 border-b pb-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight">
            <BookSearch className="h-8 w-8 text-primary" />
            {t("title")}
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            {t("description")}
          </p>
          <BackButton />
        </div>
      </div>

      {(notebooks.length > 0 || hasActiveCriteria) && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search_placeholder")}
              className="h-10 w-full rounded-full border border-border bg-card pl-9 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex items-center gap-1">
            <FilterButton
              active={filter === "all"}
              onClick={() => setFilter("all")}
            >
              {t("filter_all")}
            </FilterButton>
            <FilterButton
              active={filter === "personal"}
              onClick={() => setFilter("personal")}
            >
              {t("filter_personal")}
            </FilterButton>
            <FilterButton
              active={filter === "team"}
              onClick={() => setFilter("team")}
            >
              {t("filter_team")}
            </FilterButton>
          </div>
        </div>
      )}

      {filtered.length > 0 && (
        <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {t("count", { count: filtered.length })}
        </p>
      )}

      {filtered.length === 0 && !hasActiveCriteria ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-20 text-center">
          <Search className="mb-4 h-12 w-12 text-muted-foreground opacity-50" />
          <h3 className="text-xl font-semibold">{t("empty_state_title")}</h3>
          <p className="mt-2 max-w-md text-muted-foreground">
            {t("empty_state_description")}
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-20 text-center">
          <Search className="mb-4 h-12 w-12 text-muted-foreground opacity-50" />
          <h3 className="text-xl font-semibold">{t("no_results_title")}</h3>
          <p className="mt-2 max-w-md text-muted-foreground">
            {t("no_results_description")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {filtered.map((notebook) => {
            const isTeam = !!notebook.teamId;
            const formattedDate = new Date(
              notebook.updatedAt,
            ).toLocaleDateString();

            return (
              <Link key={notebook.id} href={`/notebook/${notebook.id}`}>
                <Card className="group flex h-full flex-col transition-all hover:border-primary/50 hover:bg-primary/5">
                  <CardHeader className="pb-3">
                    <div className="grid grid-cols-1 items-start justify-between gap-4">
                      <CardTitle className="line-clamp-1 text-lg transition-colors group-hover:text-primary">
                        {notebook.title}
                      </CardTitle>

                      <Badge
                        variant={isTeam ? "default" : "secondary"}
                        className="flex shrink-0 items-center gap-1"
                      >
                        {isTeam ? <Users size={12} /> : <User size={12} />}
                        {isTeam ? t("badge_team") : t("badge_personal")}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardFooter className="flex items-center justify-between border-t pt-4 font-mono text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-1.5 truncate font-medium">
                      {isTeam ? <Users size={14} /> : <User size={14} />}
                      <span
                        className="max-w-30 truncate"
                        title={displayOwnerName(notebook.ownerName)}
                      >
                        {displayOwnerName(notebook.ownerName)}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Calendar size={14} />
                      {formattedDate}
                    </div>
                  </CardFooter>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

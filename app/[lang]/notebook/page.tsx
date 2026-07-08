"use client";

import { FileText, NotebookPen, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useNotebookManager } from "@/components/notebook/notebook-manager";
import { useTeamNotebookManager } from "@/components/notebook/team/team-notebook-manager";
import { Button } from "@/components/ui/button";
import { fetchUserTeams } from "@/lib/api/teams-service";
import type { Team, TeamRole } from "@/lib/types/team-types";

function AmbientGlow() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="animate-ambient-drift absolute top-8 left-[10%] size-72 rounded-full bg-accent-violet/15 blur-3xl" />
      <div
        className="animate-ambient-drift absolute top-0 right-[10%] size-64 rounded-full bg-primary/10 blur-3xl"
        style={{ animationDelay: "2s" }}
      />
    </div>
  );
}

function EmptyState() {
  const t = useTranslations("sidebar");
  const { createPage } = useNotebookManager();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center py-24">
      <h1 className="text-2xl font-semibold">{t("no_pages")}</h1>
      <p className="text-muted-foreground max-w-md">
        {t("empty_notebook_desc")}
      </p>
      <Button onClick={() => createPage()} className="gap-2">
        <Plus className="size-4" />
        {t("new_page")}
      </Button>
    </div>
  );
}

function NotebookCard({ id, title }: { id: string; title: string }) {
  return (
    <Link
      href={`/notebook/${id}`}
      className="group flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <FileText className="size-4 text-muted-foreground group-hover:text-accent-foreground" />
      <span className="truncate font-medium">{title || "Sem título"}</span>
    </Link>
  );
}

export default function NotebookHomePage() {
  const t = useTranslations("sidebar");
  const { pages, createPage } = useNotebookManager();
  const { teamPages, refreshTeamPages } = useTeamNotebookManager();
  const [teams, setTeams] = useState<[Team, TeamRole][]>([]);

  useEffect(() => {
    fetchUserTeams()
      .then((data) => {
        setTeams(data);
        for (const [team] of data) refreshTeamPages(team.id);
      })
      .catch(() => setTeams([]));
  }, [refreshTeamPages]);

  if (pages.length === 0 && teams.length === 0) {
    return (
      <div className="relative flex flex-1 overflow-hidden">
        <AmbientGlow />
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col gap-12 overflow-hidden py-4">
      <AmbientGlow />
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <NotebookPen className="size-5 text-primary" />
            {t("my_notebook")}
          </h2>
          <Button size="sm" onClick={() => createPage()} className="gap-2">
            <Plus className="size-4" />
            {t("new_page")}
          </Button>
        </div>
        {pages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty_notebook_desc")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {pages.map((page) => (
              <NotebookCard key={page.id} id={page.id} title={page.title} />
            ))}
          </div>
        )}
      </section>

      {teams.length > 0 && (
        <section className="flex flex-col gap-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="size-5 text-primary" />
            Times
          </h2>

          <div className="flex flex-col gap-8">
            {teams.map(([team]) => {
              const pagesOfTeam = teamPages[team.id] ?? [];
              return (
                <div key={team.id} className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <h3 className="font-mono text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                      {team.name}
                    </h3>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  {pagesOfTeam.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Este time ainda não tem cadernos.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {pagesOfTeam.map((page) => (
                        <NotebookCard key={page.id} id={page.id} title={page.title} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

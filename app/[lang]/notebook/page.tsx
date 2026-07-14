"use client";

import { NotebookPen, Plus, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { FolderedNotebooks } from "@/components/notebook/folders/foldered-notebooks";
import { useNotebookManager } from "@/components/notebook/notebook-manager";
import { useTeamNotebookManager } from "@/components/notebook/team/team-notebook-manager";
import { Button } from "@/components/ui/button";
import {
  createFolder,
  createTeamFolder,
  deleteFolder,
  deleteTeamFolder,
  type Folder,
  fetchFolders,
  fetchTeamFolders,
  moveNotebookToFolder,
  renameFolder,
  renameTeamFolder,
  setFolderTags,
  setNotebookTags,
  setTeamFolderTags,
} from "@/lib/api/folders-service";
import { fetchUserTeams } from "@/lib/api/teams-service";
import type { Team, TeamRole } from "@/lib/types/team-types";

function AmbientGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="animate-ambient-drift absolute -top-10 left-[5%] size-80 rounded-full bg-accent-violet/20 blur-3xl md:size-96" />
      <div
        className="animate-ambient-drift absolute -top-16 right-[5%] size-72 rounded-full bg-primary/15 blur-3xl md:size-80"
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

export default function NotebookHomePage() {
  const t = useTranslations("sidebar");
  const { pages, createPage, refreshPages } = useNotebookManager();
  const { teamPages, refreshTeamPages } = useTeamNotebookManager();
  const [teams, setTeams] = useState<[Team, TeamRole][]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [teamFolders, setTeamFolders] = useState<Record<string, Folder[]>>({});

  const refreshFolders = useCallback(() => {
    fetchFolders()
      .then((f) => setFolders(f ?? []))
      .catch(() => {});
  }, []);

  const refreshTeamFolders = useCallback((teamId: string) => {
    fetchTeamFolders(teamId)
      .then((f) => setTeamFolders((prev) => ({ ...prev, [teamId]: f ?? [] })))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshFolders();
  }, [refreshFolders]);

  useEffect(() => {
    fetchUserTeams()
      .then((data) => {
        setTeams(data);
        for (const [team] of data) {
          refreshTeamPages(team.id);
          refreshTeamFolders(team.id);
        }
      })
      .catch(() => setTeams([]));
  }, [refreshTeamPages, refreshTeamFolders]);

  if (pages.length === 0 && teams.length === 0) {
    return (
      <div className="relative flex flex-1">
        <AmbientGlow />
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 flex-col gap-12 py-4">
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
        {pages.length === 0 && folders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("empty_notebook_desc")}
          </p>
        ) : (
          <FolderedNotebooks
            notebooks={pages}
            folders={folders}
            canManage
            onCreateFolder={async (name) => {
              await createFolder(name);
              refreshFolders();
            }}
            onRenameFolder={async (id, name) => {
              await renameFolder(id, name);
              refreshFolders();
            }}
            onDeleteFolder={async (id) => {
              await deleteFolder(id);
              refreshFolders();
              refreshPages();
            }}
            onMoveNotebook={async (id, folderId) => {
              await moveNotebookToFolder(id, folderId);
              refreshPages();
            }}
            onSetNotebookTags={async (id, tags) => {
              await setNotebookTags(id, tags);
              refreshPages();
            }}
            onSetFolderTags={async (id, tags) => {
              await setFolderTags(id, tags);
              refreshFolders();
            }}
          />
        )}
      </section>

      {teams.length > 0 && (
        <section className="flex flex-col gap-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="size-5 text-primary" />
            Times
          </h2>

          <div className="flex flex-col gap-8">
            {teams.map(([team, role]) => {
              const pagesOfTeam = teamPages[team.id] ?? [];
              const foldersOfTeam = teamFolders[team.id] ?? [];
              const canManage = role.can_write;
              if (pagesOfTeam.length === 0 && foldersOfTeam.length === 0) {
                return (
                  <div key={team.id} className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <h3 className="font-mono text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                        {team.name}
                      </h3>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Este time ainda não tem cadernos.
                    </p>
                  </div>
                );
              }
              return (
                <div key={team.id} className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <h3 className="font-mono text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                      {team.name}
                    </h3>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <FolderedNotebooks
                    notebooks={pagesOfTeam}
                    folders={foldersOfTeam}
                    canManage={canManage}
                    onCreateFolder={async (name) => {
                      await createTeamFolder(team.id, name);
                      refreshTeamFolders(team.id);
                    }}
                    onRenameFolder={async (id, name) => {
                      await renameTeamFolder(team.id, id, name);
                      refreshTeamFolders(team.id);
                    }}
                    onDeleteFolder={async (id) => {
                      await deleteTeamFolder(team.id, id);
                      refreshTeamFolders(team.id);
                      refreshTeamPages(team.id);
                    }}
                    onMoveNotebook={async (id, folderId) => {
                      await moveNotebookToFolder(id, folderId);
                      refreshTeamPages(team.id);
                    }}
                    onSetNotebookTags={async (id, tags) => {
                      await setNotebookTags(id, tags);
                      refreshTeamPages(team.id);
                    }}
                    onSetFolderTags={async (id, tags) => {
                      await setTeamFolderTags(team.id, id, tags);
                      refreshTeamFolders(team.id);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

"use client";

import { ChevronDown, ChevronRight, Plus, Settings, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { Button } from "../ui/button";
import { PageSidebar } from "./page/page-sidebar";
import { useTeamNotebookManager } from "./team/team-notebook-manager";

interface TeamSidebarProps {
  team: { id: string; name: string };
}

export function TeamSidebar({ team }: TeamSidebarProps) {
  const a = useTranslations("team_sidebar");

  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const {
    teamPages,
    createTeamPage,
    deleteTeamPage,
    renameTeamPage,
    refreshTeamPages,
  } = useTeamNotebookManager();

  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => refreshTeamPages(team.id), 6000);
    return () => clearInterval(id);
  }, [team.id, refreshTeamPages]);

  if (!user) {
    return null;
  }

  const pages = teamPages[team.id] || [];

  const handleCreatePage = (e: React.MouseEvent) => {
    e.stopPropagation();
    createTeamPage(team.id);
    setIsOpen(true);
  };

  return (
    <div className="flex flex-col w-full">
      <div className="group flex w-full items-center justify-between rounded-md p-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? (
            <ChevronDown size={14} className="shrink-0" />
          ) : (
            <ChevronRight size={14} className="shrink-0" />
          )}
          <Users size={14} className="shrink-0" />
          <span className="truncate font-medium">{team.name}</span>
        </button>

        <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-accent-foreground"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/teams/${team.id}/settings`);
            }}
          >
            <Settings className="size-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:text-accent-foreground"
            onClick={handleCreatePage}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="flex flex-col gap-1 pl-2 mt-1">
          {pages.length === 0 ? (
            <span className="p-2 text-xs text-muted-foreground italic">
              {a("empty_notebooks")}
            </span>
          ) : (
            pages.map((page) => (
              <div key={page.id}>
                <PageSidebar
                  editingId={editingId}
                  setEditingId={setEditingId}
                  page={page}
                  renameTeamPage={renameTeamPage}
                  teamId={team.id}
                  deleteTeamPage={deleteTeamPage}
                  onDeleteTeamPage={refreshTeamPages}
                />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

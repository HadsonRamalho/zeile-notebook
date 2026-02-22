"use client";

import {
  ChevronDown,
  ChevronRight,
  Plus,
  RotateCw,
  Settings,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
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
      <div className="flex bg-card  items-center justify-between p-2 w-full hover:bg-muted rounded-md group text-sm text-muted-foreground hover:text-foreground transition-colors">
        <div
          className="flex items-center gap-2 overflow-hidden hover:cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? (
            <ChevronDown size={14} className="shrink-0" />
          ) : (
            <ChevronRight size={14} className="shrink-0" />
          )}
          <Users size={14} className="shrink-0" />
          <span className="font-medium truncate">{team.name}</span>
        </div>

        <div className="flex gap-2 justify-end">
          <Button
            className="rounded hover:bg-white/10 md:opacity-0 md:group-hover:opacity-100 transition-opacity size-5"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/teams/${team.id}/settings`);
            }}
          >
            <Settings className="size-4" />
          </Button>

          <Button
            onClick={() => {
              refreshTeamPages(team.id);
            }}
            className="rounded hover:bg-white/10 md:opacity-0 md:group-hover:opacity-100 transition-opacity size-5"
          >
            <RotateCw className="size-4" />
          </Button>

          <Button
            onClick={handleCreatePage}
            className="rounded hover:bg-white/10 md:opacity-0 md:group-hover:opacity-100 transition-opacity size-5"
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

"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Loader } from "@/components/motion/loader";
import { useAuth } from "@/context/auth-context";
import { handleApiError } from "@/lib/api/handle-api-error";
import {
  createTeam as createTeamApi,
  fetchUserTeams,
} from "@/lib/api/teams-service";
import type { Team, TeamRole } from "@/lib/types/team-types";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { useTeamNotebookManager } from "./team/team-notebook-manager";
import { TeamSidebar } from "./team-sidebar";

export function TeamsSidebar() {
  const a = useTranslations("sidebar");
  const t = useTranslations("api_errors");
  const { user } = useAuth();
  const { refreshTeamPages } = useTeamNotebookManager();
  const [teams, setTeams] = useState<[Team, TeamRole][]>();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const loadTeams = async () => {
    const data = await fetchUserTeams();
    setTeams(data);

    for (const team of data) {
      await refreshTeamPages(team[0].id);
    }
  };

  useEffect(() => {
    if (!teams && user) {
      loadTeams();
    }
  }, [teams, user]);

  useEffect(() => {
    if (!user) return;
    const id = setInterval(loadTeams, 6000);
    return () => clearInterval(id);
  }, [user]);

  if (!user) {
    return null;
  }

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;

    setIsCreating(true);
    try {
      const newTeam = await createTeamApi({
        name: newTeamName,
        description: newTeamDesc || undefined,
      });

      const newRole: TeamRole = {
        id: "1",
        team_id: newTeam.id,
        name: "Admin",
        can_read: true,
        can_write: true,
        can_manage_privacy: true,
        can_manage_clones: true,
        can_invite_users: true,
        can_remove_users: true,
        can_manage_permissions: true,
        can_manage_team: true,
      };

      setTeams((prev) =>
        prev ? [...prev, [newTeam, newRole]] : [[newTeam, newRole]],
      );

      setNewTeamName("");
      setNewTeamDesc("");
      setIsDialogOpen(false);
    } catch (err) {
      handleApiError({ err, t });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 pb-4">
      <div className="flex items-center justify-between px-2 mb-2">
        <span className="text-xs font-bold uppercase text-muted-foreground">
          {a("my_teams")}
        </span>

        <div className="flex justify-end">
          <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                className="text-muted-foreground hover:text-accent-foreground"
                size="icon-xs"
                variant="ghost"
                title={a("new_team")}
              >
                <Plus className="size-4" />
              </Button>
            </AlertDialogTrigger>

            <AlertDialogContent className="sm:max-w-md">
              <form onSubmit={handleCreateTeam}>
                <AlertDialogHeader>
                  <AlertDialogTitle>Criar Novo Time</AlertDialogTitle>
                  <AlertDialogDescription>
                    Preencha os detalhes para criar um novo espaço de trabalho
                    colaborativo.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="flex flex-col gap-4 py-4">
                  <div className="space-y-2">
                    <label htmlFor="teamName" className="text-sm font-medium">
                      {a("team_name")} <span className="text-destructive">*</span>
                    </label>
                    <input
                      id="teamName"
                      required
                      value={newTeamName}
                      onChange={(e) => setNewTeamName(e.target.value)}
                      placeholder="Ex: Class 12"
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="teamDesc" className="text-sm font-medium">
                      {a("team_description")}
                    </label>
                    <textarea
                      id="teamDesc"
                      value={newTeamDesc}
                      onChange={(e) => setNewTeamDesc(e.target.value)}
                      placeholder={a("team_description")}
                      className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none focus:border-primary transition-colors min-h-20 resize-none"
                    />
                  </div>
                </div>

                <AlertDialogFooter>
                  <AlertDialogCancel
                    type="button"
                    onClick={() => {
                      setNewTeamName("");
                      setNewTeamDesc("");
                    }}
                  >
                    {a("cancel_button")}
                  </AlertDialogCancel>
                  <Button
                    type="submit"
                    disabled={isCreating || !newTeamName.trim()}
                  >
                    {isCreating ? (
                      <Loader variant="spinner" size={16} className="mr-2" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    {isCreating ? a("creating_button") : a("create_button")}
                  </Button>
                </AlertDialogFooter>
              </form>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {teams?.length === 0 && (
          <span className="px-2 text-xs text-muted-foreground italic">
            {a("no_teams_found")}
          </span>
        )}

        {teams?.map((team) => (
          <TeamSidebar key={team[0].id} team={team[0]} />
        ))}
      </div>
    </div>
  );
}

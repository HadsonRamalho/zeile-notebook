"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Loader } from "@/components/motion/loader";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { handleApiError } from "@/lib/api/handle-api-error";
import { createTeam as createTeamApi } from "@/lib/api/teams-service";
import type { TeamRole, TeamWithUserRole } from "@/types/team-types";

interface CreateTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (team: TeamWithUserRole) => void;
}

export function CreateTeamDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateTeamDialogProps) {
  const a = useTranslations("sidebar");
  const t = useTranslations("api_errors");
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const reset = () => {
    setNewTeamName("");
    setNewTeamDesc("");
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;

    setIsCreating(true);
    const result = await createTeamApi({
      name: newTeamName,
      description: newTeamDesc || null,
    });
    if (result.isErr()) {
      handleApiError({ err: result.error, t });
    } else {
      const newTeam = result.data;
      const newRole: TeamRole = {
        id: "1",
        teamId: newTeam.id,
        name: "Admin",
        canRead: true,
        canWrite: true,
        canManagePrivacy: true,
        canManageClones: true,
        canInviteUsers: true,
        canRemoveUsers: true,
        canManagePermissions: true,
        canManageTeam: true,
      };

      onCreated({ team: newTeam, role: newRole });
      reset();
      onOpenChange(false);
    }
    setIsCreating(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <form onSubmit={handleCreateTeam}>
          <AlertDialogHeader>
            <AlertDialogTitle>{a("new_team_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {a("new_team_description")}
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
            <AlertDialogCancel type="button" onClick={reset}>
              {a("cancel_button")}
            </AlertDialogCancel>
            <Button type="submit" disabled={isCreating || !newTeamName.trim()}>
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
  );
}

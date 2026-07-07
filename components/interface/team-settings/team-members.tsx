"use client";

import { Plus, Send, Trash2, Users } from "lucide-react";
import { Loader } from "@/components/motion/loader";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import { useAuth } from "@/context/auth-context";
import { handleApiError } from "@/lib/api/handle-api-error";
import { inviteTeamMember, removeMember } from "@/lib/api/teams-service";
import type { TeamMemberWithUserData, TeamRole } from "@/lib/types/team-types";

interface TeamMembersProps {
  teamId: string;
  userPermissions: TeamRole | undefined;
  roles: TeamRole[];
  members: [TeamMemberWithUserData, TeamRole][];
  onUpdate: () => void;
}

export function TeamMembers({
  userPermissions,
  teamId,
  roles,
  members,
  onUpdate,
}: TeamMembersProps) {
  const { user } = useAuth();
  const a = useTranslations("team_settings.team_member");
  const t = useTranslations("api_errors");
  const locale = useLocale();

  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState("");
  const [isInviting, setIsInviting] = useState(false);

  const [memberToRemove, setMemberToRemove] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteRoleId) return;

    setIsInviting(true);
    try {
      await inviteTeamMember(teamId, {
        email: inviteEmail,
        roleId: inviteRoleId,
      });

      toast.success(a("invited_member"));
      onUpdate();

      setInviteEmail("");
      setInviteRoleId("");
      setIsInviteDialogOpen(false);
    } catch (err) {
      handleApiError({ err, t });
    } finally {
      setIsInviting(false);
    }
  };

  const confirmRemoveMember = async () => {
    if (!memberToRemove) return;

    setIsRemoving(true);
    try {
      await removeMember(teamId, memberToRemove.id);

      toast.success("Membro removido com sucesso.");
      onUpdate();
      setMemberToRemove(null);
    } catch (err) {
      handleApiError({ err, t });
    } finally {
      setIsRemoving(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader className="grid grid-cols-1 md:flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5" />
              {a("title")}
            </CardTitle>
            <CardDescription>{a("description")}</CardDescription>
          </div>

          <AlertDialog
            open={isInviteDialogOpen}
            onOpenChange={setIsInviteDialogOpen}
          >
            <AlertDialogTrigger asChild>
              {userPermissions?.can_invite_users && (
                <Button size="sm" className="gap-2">
                  <Plus size={16} /> {a("invite_member_button")}
                </Button>
              )}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <form onSubmit={handleInviteMember}>
                <AlertDialogHeader>
                  <AlertDialogTitle>{a("add_member_title")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {a("add_member_description")}
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="flex flex-col gap-4 py-4">
                  <div className="space-y-2">
                    <Label>{a("user_email")}</Label>
                    <Input
                      type="email"
                      required
                      placeholder="u123@email.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{a("user_role")}</Label>
                    <Select value={inviteRoleId} onValueChange={setInviteRoleId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={a("select_role")} />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <AlertDialogFooter>
                  <AlertDialogCancel
                    type="button"
                    onClick={() => {
                      setInviteEmail("");
                      setInviteRoleId("");
                    }}
                  >
                    {a("cancel_button")}
                  </AlertDialogCancel>
                  <Button
                    type="submit"
                    disabled={isInviting || !inviteEmail || !inviteRoleId}
                  >
                    {isInviting ? (
                      <Loader variant="spinner" size={16} className="mr-2" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    {a("send_invite")}
                  </Button>
                </AlertDialogFooter>
              </form>
            </AlertDialogContent>
          </AlertDialog>
        </CardHeader>

        <CardContent>
          <div className="divide-y divide-border border rounded-md">
            {members.map((member) => (
              <div
                key={member[0].id}
                className="grid grid-cols-1 justify-end p-4 space-y-2 hover:bg-muted/50 transition-colors"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{member[0].name}</span>
                  <span className="text-xs text-muted-foreground">
                    {member[0].email}
                  </span>
                  <span className="text-xs text-muted-foreground opacity-75">
                    {a("joined_on")}{" "}
                    {new Date(member[0].joined_at).toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <div className="flex items-center justify-between md:justify-end gap-4">
                  <Badge variant="secondary">{member[1].name}</Badge>
                  {member[0].user_id === user.id && <Badge>Você</Badge>}

                  {!member[1].can_manage_team &&
                    (userPermissions?.can_manage_team ||
                      userPermissions?.can_remove_users) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        title={a("remove_member_button")}
                        onClick={() =>
                          setMemberToRemove({
                            id: member[0].user_id,
                            name: member[0].name,
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </Button>
                    )}
                </div>
              </div>
            ))}
            {members.length === 0 && (
              <div className="p-8 text-sm text-center text-muted-foreground">
                {a("no_members_found")}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{a("remove_member_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {memberToRemove &&
                a.rich("remove_member_description", {
                  name: memberToRemove?.name,
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>
              {a("cancel_button")}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={confirmRemoveMember}
              disabled={isRemoving}
            >
              {isRemoving ? (
                <Loader variant="spinner" size={16} className="mr-2" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {a("confirm_remove_button")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

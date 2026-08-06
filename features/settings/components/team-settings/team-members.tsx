"use client";

import {
  KeyRound,
  MoreVertical,
  Plus,
  Send,
  Shield,
  Trash2,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Loader } from "@/components/motion/loader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/auth-context";
import { handleApiError } from "@/lib/api/handle-api-error";
import {
  inviteTeamMember,
  removeMember,
  updateMemberRole,
} from "@/lib/api/teams-service";
import type {
  TeamMemberWithRoleAndUserData,
  TeamRole,
} from "@/types/team-types";

interface TeamMembersProps {
  teamId: string;
  userPermissions: TeamRole | undefined;
  roles: TeamRole[];
  members: TeamMemberWithRoleAndUserData[];
  onUpdate: () => void;
  onEditRolePermissions: (roleId: string) => void;
  onEditMemberPermissions: (userId: string) => void;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function roleDisplayName(role: TeamRole, t: (k: string) => string) {
  if (role.name === "Owner") return t("defaults.owner");
  if (role.name === "Member") return t("defaults.member");
  return role.name;
}

export function TeamMembers({
  userPermissions,
  teamId,
  roles,
  members,
  onUpdate,
  onEditRolePermissions,
  onEditMemberPermissions,
}: TeamMembersProps) {
  const { user } = useAuth();
  const a = useTranslations("team_settings.team_member");
  const rt = useTranslations("team_settings.team_role");
  const t = useTranslations("api_errors");
  const locale = useLocale();

  const canManageRoles = !!userPermissions?.canManagePermissions;

  const handleChangeRole = async (userId: string, roleId: string) => {
    const result = await updateMemberRole(teamId, { userId, roleId });
    if (result.isErr()) {
      handleApiError({ err: result.error, t });
    } else {
      toast.success(a("role_updated"));
      onUpdate();
    }
  };

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
    const result = await inviteTeamMember(teamId, {
      email: inviteEmail,
      roleId: inviteRoleId,
    });
    if (result.isErr()) {
      handleApiError({ err: result.error, t });
    } else {
      toast.success(a("invited_member"));
      onUpdate();

      setInviteEmail("");
      setInviteRoleId("");
      setIsInviteDialogOpen(false);
    }
    setIsInviting(false);
  };

  const confirmRemoveMember = async () => {
    if (!memberToRemove) return;

    setIsRemoving(true);
    const result = await removeMember(teamId, memberToRemove.id);
    if (result.isErr()) {
      handleApiError({ err: result.error, t });
    } else {
      toast.success(a("remove_member_success"));
      onUpdate();
      setMemberToRemove(null);
    }
    setIsRemoving(false);
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
              {userPermissions?.canInviteUsers && (
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
                    <Select
                      value={inviteRoleId}
                      onValueChange={setInviteRoleId}
                    >
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
            {members.map(({ member: m, role }) => (
              <div
                key={m.id}
                className="flex flex-wrap items-center gap-3 p-4 hover:bg-muted/50 transition-colors"
              >
                <Avatar className="size-9 shrink-0">
                  {m.avatarUrl && (
                    <AvatarImage src={m.avatarUrl} alt={m.name} />
                  )}
                  <AvatarFallback className="text-xs">
                    {getInitials(m.name)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">
                    {m.name}
                    {m.userId === user.id && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({a("you")})
                      </span>
                    )}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {m.email}
                  </span>
                  <span className="text-xs text-muted-foreground opacity-75">
                    {a("joined_on")}{" "}
                    {new Date(m.joinedAt).toLocaleDateString(locale, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {canManageRoles ? (
                    <button
                      type="button"
                      onClick={() => onEditRolePermissions(role.id)}
                      title={rt("notebook_permissions")}
                    >
                      <Badge
                        variant="secondary"
                        className="cursor-pointer hover:bg-secondary/70"
                      >
                        {roleDisplayName(role, rt)}
                      </Badge>
                    </button>
                  ) : (
                    <Badge variant="secondary">
                      {roleDisplayName(role, rt)}
                    </Badge>
                  )}

                  {canManageRoles && m.userId !== user.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={a("member_actions")}
                        >
                          <MoreVertical size={16} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>
                          {a("change_role")}
                        </DropdownMenuLabel>
                        <DropdownMenuRadioGroup
                          value={m.roleId}
                          onValueChange={(rid) =>
                            handleChangeRole(m.userId, rid)
                          }
                        >
                          {roles.map((role) => (
                            <DropdownMenuRadioItem
                              key={role.id}
                              value={role.id}
                            >
                              {roleDisplayName(role, rt)}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onEditMemberPermissions(m.userId)}
                        >
                          <KeyRound size={16} />
                          {a("edit_member_permissions")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onEditRolePermissions(role.id)}
                        >
                          <Shield size={16} />
                          {a("edit_role_permissions")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

                  {!role.canManageTeam &&
                    (userPermissions?.canManageTeam ||
                      userPermissions?.canRemoveUsers) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        title={a("remove_member_button")}
                        onClick={() =>
                          setMemberToRemove({
                            id: m.userId,
                            name: m.name,
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

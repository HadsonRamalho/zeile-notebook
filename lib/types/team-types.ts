import type z from "zod";
import type { getTeamFormSchema } from "../schemas/team-schemas";

export interface Team {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  createdAt: string;
}

export interface NewTeam {
  name: string;
  description?: string;
}

export interface TeamRole {
  id: string;
  teamId: string;
  name: string;
  canRead: boolean;
  canWrite: boolean;
  canManagePrivacy: boolean;
  canManageClones: boolean;
  canInviteUsers: boolean;
  canRemoveUsers: boolean;
  canManagePermissions: boolean;
  canManageTeam: boolean;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  roleId: string;
  joinedAt: string;
}

export interface TeamMemberWithUserData {
  id: string;

  name: string;
  email: string;
  avatarUrl: string | null;

  teamId: string;
  userId: string;
  roleId: string;
  joinedAt: string;
}

export interface UpdateTeamRole {
  id: string;
  name?: string;
  canRead?: boolean;
  canWrite?: boolean;
  canManagePrivacy?: boolean;
  canManageClones?: boolean;
  canInviteUsers?: boolean;
  canRemoveUsers?: boolean;
  canManagePermissions?: boolean;
}

export interface NewTeamRoleRequest {
  name: string;
  canRead: boolean;
  canWrite: boolean;
  canManagePrivacy: boolean;
  canManageClones: boolean;
  canInviteUsers: boolean;
  canRemoveUsers: boolean;
  canManagePermissions: boolean;
  canManageTeam: boolean;
}

export interface UpdateTeam {
  name?: string;
  description?: string;
  imageUrl?: string;
}

export interface InviteTeamMember {
  email: string;
  roleId: string;
}

export type TeamMemberWithRole = [TeamMember, TeamRole];
export type TeamWithUserRole = [Team, TeamRole];
export type TeamMemberWithRoleAndUserData = [TeamMemberWithUserData, TeamRole];

export type TeamFormValues = z.infer<ReturnType<typeof getTeamFormSchema>>;

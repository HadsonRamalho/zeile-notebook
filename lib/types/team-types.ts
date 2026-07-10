import type z from "zod";
import type { getTeamFormSchema } from "../schemas/team-schemas";

export interface Team {
  id: string;
  name: string;
  description?: string;
  image_url?: string;
  created_at: string;
}

export interface NewTeam {
  name: string;
  description?: string;
}

export interface TeamRole {
  id: string;
  team_id: string;
  name: string;
  can_read: boolean;
  can_write: boolean;
  can_manage_privacy: boolean;
  can_manage_clones: boolean;
  can_invite_users: boolean;
  can_remove_users: boolean;
  can_manage_permissions: boolean;
  can_manage_team: boolean;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role_id: string;
  joined_at: string;
}

export interface TeamMemberWithUserData {
  id: string;

  name: string;
  email: string;

  team_id: string;
  user_id: string;
  role_id: string;
  joined_at: string;
}

export interface UpdateTeamRole {
  id: string;
  name?: string;
  can_read?: boolean;
  can_write?: boolean;
  can_manage_privacy?: boolean;
  can_manage_clones?: boolean;
  can_invite_users?: boolean;
  can_remove_users?: boolean;
  can_manage_permissions?: boolean;
}

export interface NewTeamRoleRequest {
  name: string;
  can_read: boolean;
  can_write: boolean;
  can_manage_privacy: boolean;
  can_manage_clones: boolean;
  can_invite_users: boolean;
  can_remove_users: boolean;
  can_manage_permissions: boolean;
  can_manage_team: boolean;
}

export interface UpdateTeam {
  name?: string;
  description?: string;
  image_url?: string;
}

export interface InviteTeamMember {
  email: string;
  roleId: string;
}

export type TeamMemberWithRole = [TeamMember, TeamRole];
export type TeamWithUserRole = [Team, TeamRole];
export type TeamMemberWithRoleAndUserData = [TeamMemberWithUserData, TeamRole];

export type TeamFormValues = z.infer<ReturnType<typeof getTeamFormSchema>>;

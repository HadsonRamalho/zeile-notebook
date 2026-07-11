import type { Notebook } from "../types";
import type {
  InviteTeamMember,
  NewTeam,
  NewTeamRoleRequest,
  Team,
  TeamMemberWithRole,
  TeamMemberWithRoleAndUserData,
  TeamRole,
  TeamWithUserRole,
  UpdateTeam,
  UpdateTeamRole,
} from "../types/team-types";
import { api } from "./base";

export async function createTeam(team: NewTeam) {
  return await api.post<Team>(`/team`, team);
}

export async function deleteTeam(id: string) {
  return await api.delete(`/team/${id}`);
}

export async function fetchTeam(id: string) {
  return await api.get<Team>(`/team/${id}`);
}

export async function fetchTeamMembers(id: string) {
  return await api.get<TeamMemberWithRoleAndUserData[]>(`/team/${id}/members`);
}

export async function updateMemberRole(
  teamId: string,
  body: { user_id: string; role_id: string },
) {
  return await api.patch(`/team/${teamId}/members`, body);
}

export async function removeMember(teamId: string, userId: string) {
  return await api.delete(`/team/${teamId}/members`, {
    body: JSON.stringify(userId),
  });
}

export async function updateRole(teamId: string, role: UpdateTeamRole) {
  return await api.patch(`/team/${teamId}/roles`, role);
}

export async function createTeamRole(teamId: string, role: NewTeamRoleRequest) {
  return await api.post(`/team/${teamId}/roles`, role);
}

export async function createTeamPage(teamId: string) {
  return await api.post(`/team/${teamId}/notebooks`);
}

export async function fetchTeamPages(teamId: string) {
  return await api.get<Notebook[]>(`/team/${teamId}/notebooks`);
}

export async function updateTeam(teamId: string, team: UpdateTeam) {
  return await api.patch(`/team/${teamId}`, team);
}

export async function fetchTeamRoles(teamId: string) {
  return await api.get<TeamRole[]>(`/team/${teamId}/roles`);
}

export async function fetchUserTeams() {
  return await api.get<TeamWithUserRole[]>(`/team`);
}

export async function acceptTeamInvite(token: string) {
  return await api.post(`/team/invites/accept`, { token });
}

export async function inviteTeamMember(teamId: string, data: InviteTeamMember) {
  return await api.post(`/team/${teamId}/invites`, data);
}

export async function getUserTeamPermissions(teamId: string) {
  return await api.get<TeamMemberWithRole>(
    `/team/${teamId}/members/permissions`,
  );
}

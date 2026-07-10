import type {
  CapabilitySnapshot,
  CreateGrantRequest,
  PermissionCatalog,
  TeamGrant,
} from "../types/permission-types";
import { api } from "./base";

export async function getNotebookCapabilities(id: string) {
  return await api.get<CapabilitySnapshot>(`/notebook/${id}/capabilities`);
}

export async function getPermissionCatalog() {
  return await api.get<PermissionCatalog>(`/permissions/catalog`);
}

export async function getTeamGrants(teamId: string) {
  return await api.get<TeamGrant[]>(`/team/${teamId}/grants`);
}

export async function createTeamGrant(
  teamId: string,
  body: CreateGrantRequest,
) {
  return await api.post<TeamGrant>(`/team/${teamId}/grants`, body);
}

export async function deleteTeamGrant(teamId: string, grantId: string) {
  return await api.delete<void>(`/team/${teamId}/grants/${grantId}`);
}

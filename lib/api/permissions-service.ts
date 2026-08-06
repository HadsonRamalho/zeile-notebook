import type {
  CapabilitySnapshot,
  CreateGrantRequest,
  PermissionCatalog,
  TeamGrant,
} from "@/types/permission-types";
import { createApi } from "./base";

const api = createApi("grants");

export async function getNotebookCapabilities(id: string) {
  return await api.get<CapabilitySnapshot>(`/notebook/${id}/capabilities`);
}

export async function getPermissionCatalog() {
  return await api.get<PermissionCatalog>(`/permissions/catalog`);
}

export async function getTeamCapabilities(teamId: string) {
  return await api.get<CapabilitySnapshot>(`/team/${teamId}/capabilities`);
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

export async function getPublicGrants(notebookId: string) {
  return await api.get<TeamGrant[]>(`/notebook/${notebookId}/public-grants`);
}

export async function createPublicGrant(
  notebookId: string,
  body: { permissionKey: string; effect: "allow" | "deny" },
) {
  return await api.post<TeamGrant>(
    `/notebook/${notebookId}/public-grants`,
    body,
  );
}

export async function deletePublicGrant(notebookId: string, grantId: string) {
  return await api.delete<void>(
    `/notebook/${notebookId}/public-grants/${grantId}`,
  );
}

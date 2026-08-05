import type {
  AdminNotebookView,
  AdminSystemStats,
  AdminTeamView,
  AdminUserView,
  PaginatedResponse,
} from "../types/admin-types";
import { createApi } from "./base";

const api = createApi("admin");

export async function fetchAdminStats(): Promise<AdminSystemStats> {
  const response = await api.get<AdminSystemStats>("/admin/stats");
  return response;
}

export async function fetchAdminUsers(
  page: number,
  limit: number,
): Promise<PaginatedResponse<AdminUserView>> {
  const response = await api.get<PaginatedResponse<AdminUserView>>(
    `/admin/users?page=${page}&limit=${limit}`,
  );
  return response;
}

export async function fetchAdminTeams(
  page: number,
  limit: number,
): Promise<PaginatedResponse<AdminTeamView>> {
  const response = await api.get<PaginatedResponse<AdminTeamView>>(
    `/admin/teams?page=${page}&limit=${limit}`,
  );
  return response;
}

export async function fetchAdminNotebooks(
  page: number,
  limit: number,
): Promise<PaginatedResponse<AdminNotebookView>> {
  const response = await api.get<PaginatedResponse<AdminNotebookView>>(
    `/admin/notebooks?page=${page}&limit=${limit}`,
  );
  return response;
}

export type AdminSearchKind = "users" | "teams" | "notebooks";

export interface AdminSearchResult {
  id: string;
  label: string;
  sublabel: string | null;
}

export async function adminSearch(kind: AdminSearchKind, q: string) {
  return api.get<AdminSearchResult[]>(
    `/admin/search?kind=${kind}&q=${encodeURIComponent(q)}`,
  );
}

export interface AdminNotifyPayload {
  targetKind: "user" | "team" | "notebook";
  targetId: string;
  title: string;
  body: string;
  url?: string | undefined;
}

export async function adminNotify(payload: AdminNotifyPayload) {
  return api.post<void>("/admin/notify", payload);
}

import type {
  AdminNotebookView,
  AdminSystemStats,
  AdminTeamView,
  AdminUserView,
  PaginatedResponse,
} from "@/types/admin-types";
import { createResultApi } from "./base";

const api = createResultApi("admin");

export function fetchAdminStats() {
  return api.get<AdminSystemStats>("/admin/stats");
}

export function fetchAdminUsers(page: number, limit: number) {
  return api.get<PaginatedResponse<AdminUserView>>(
    `/admin/users?page=${page}&limit=${limit}`,
  );
}

export function fetchAdminTeams(page: number, limit: number) {
  return api.get<PaginatedResponse<AdminTeamView>>(
    `/admin/teams?page=${page}&limit=${limit}`,
  );
}

export function fetchAdminNotebooks(page: number, limit: number) {
  return api.get<PaginatedResponse<AdminNotebookView>>(
    `/admin/notebooks?page=${page}&limit=${limit}`,
  );
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

import type {
  AdminNotebookView,
  AdminSystemStats,
  AdminTeamView,
  AdminUserView,
  PaginatedResponse,
} from "../types/admin-types";
import { api } from "./base";

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

import type { Block } from "@/types/block-types";
import type {
  Notebook,
  NotebookMeta,
  PublicNotebookDoc,
  PublicNotebookResponse,
  RankedSearchItem,
} from "@/types/notebook-types";
import type { TeamRole } from "@/types/team-types";
import { createApi } from "./base";

const api = createApi("notebook-crud");
const publicApi = createApi("public");

export async function searchNotebooksRanked(query: string, limit = 16) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return api.get<RankedSearchItem[]>(`/notebook/search/ranked/?${params}`);
}

export async function getPublicNotebookBySlug(slug: string) {
  return publicApi.get<PublicNotebookDoc>(`/notebook/public/${slug}`);
}

export async function createNotebook() {
  return api.post<string>("/notebook/create");
}

export async function getMyNotebooks() {
  return api.get<Notebook[]>("/notebook/all");
}

export async function updateNotebookTitle(id: string, newTitle: string) {
  return api.patch<void>(`/notebook/${id}/title`, { title: newTitle });
}

export async function updateNotebookVisibility(id: string, isVisible: boolean) {
  return api.patch<void>(`/notebook/${id}/visibility`, {
    isVisible,
  });
}

export async function getCurrentNotebook(id: string) {
  return api.get<Notebook>(`/notebook/${id}`);
}

export async function getNotebookMeta(id: string) {
  return api.get<NotebookMeta>(`/notebook/${id}`);
}

export async function getCurrentNotebookWithBlocks(id: string) {
  return api.get<Notebook>(`/notebook/${id}/full`);
}

export async function deleteNotebook(id: string) {
  return api.delete(`/notebook/${id}`);
}

export async function cloneNotebook(id: string) {
  return api.post<string>(`/notebook/${id}/clone`);
}

export async function saveNotebookData(
  id: string,
  title: string,
  blocks: Block[],
  isPublic: boolean,
): Promise<void> {
  return api.put(`/notebook/${id}/content`, {
    title,
    blocks,
    isPublic,
  });
}

export async function getUserNotebookPermissions(id: string) {
  return await api.get<TeamRole>(`/notebook/${id}/permissions`);
}

export async function fetchPublicNotebooks(query?: string) {
  const q = query?.trim();
  const path = q
    ? `/notebook/all/public?q=${encodeURIComponent(q)}`
    : "/notebook/all/public";
  return await publicApi.get<PublicNotebookResponse[]>(path);
}

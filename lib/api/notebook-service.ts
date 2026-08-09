import type { components } from "@/lib/api/generated/openapi-types";
import type { Block } from "@/types/block-types";
import type {
  Notebook,
  NotebookMeta,
  PublicNotebookDoc,
  PublicNotebookResponse,
  RankedSearchItem,
} from "@/types/notebook-types";
import type { TeamRole } from "@/types/team-types";
import { createResultApi } from "./base";

type Schemas = components["schemas"];

const api = createResultApi("notebook-crud");
const publicApi = createResultApi("public");

export async function searchNotebooksRanked(query: string, limit = 16) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return api.get<RankedSearchItem[]>(`/notebook/search/ranked/?${params}`);
}

export async function getPublicNotebookBySlug(slug: string) {
  return publicApi.get<PublicNotebookDoc>(`/notebook/public/${slug}`);
}

export type CreateNotebookPayload = Schemas["CreateNotebookRequest"];

export async function createNotebook(payload: CreateNotebookPayload) {
  return api.post<string>("/notebook/create", payload);
}

export async function getMyNotebooks() {
  return api.get<Notebook[]>("/notebook/all");
}

export async function updateNotebookTitle(id: string, newTitle: string) {
  const payload: Schemas["UpdateNotebookTitle"] = { title: newTitle };
  return api.patch<void>(`/notebook/${id}/title`, payload);
}

export async function updateNotebookVisibility(id: string, isVisible: boolean) {
  const payload: Schemas["UpdateNotebookVisibility"] = { isVisible };
  return api.patch<void>(`/notebook/${id}/visibility`, payload);
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

export async function cloneNotebook(id: string, title: string) {
  const payload: Schemas["CloneNotebookRequest"] = { title };
  return api.post<string>(`/notebook/${id}/clone`, payload);
}

type SaveNotebookPayload = Omit<Schemas["SyncNotebookRequest"], "blocks"> & {
  blocks: Block[];
};

export async function saveNotebookData(
  id: string,
  title: string,
  blocks: Block[],
  isPublic: boolean,
) {
  const payload: SaveNotebookPayload = { title, blocks, isPublic };
  return api.put<void>(`/notebook/${id}/content`, payload);
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

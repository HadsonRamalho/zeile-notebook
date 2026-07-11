import type { Block, Notebook } from "../types";
import type { PublicNotebookResponse } from "../types/notebook-types";
import type { TeamRole } from "../types/team-types";
import { api } from "./base";

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
    is_visible: isVisible,
  });
}

export async function getCurrentNotebook(id: string) {
  return api.get<Notebook>(`/notebook/${id}`);
}

export interface NotebookMeta {
  id: string;
  user_id: string | null;
  team_id: string | null;
  is_public: boolean;
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

export async function fetchPublicNotebooks() {
  return await api.get<PublicNotebookResponse[]>("/notebook/all/public");
}

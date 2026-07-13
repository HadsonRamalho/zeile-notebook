import { api } from "./base";

export interface Folder {
  id: string;
  name: string;
  userId: string | null;
  teamId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- pessoais ----

export async function fetchFolders() {
  return api.get<Folder[]>("/notebook/folders");
}

export async function createFolder(name: string) {
  return api.post<Folder>("/notebook/folders", { name });
}

export async function renameFolder(id: string, name: string) {
  return api.patch<Folder>(`/notebook/folders/${id}`, { name });
}

export async function deleteFolder(id: string) {
  return api.delete<void>(`/notebook/folders/${id}`);
}

export async function moveNotebookToFolder(
  notebookId: string,
  folderId: string | null,
) {
  return api.patch<void>(`/notebook/${notebookId}/folder`, { folderId });
}

// ---- de time ----

export async function fetchTeamFolders(teamId: string) {
  return api.get<Folder[]>(`/team/${teamId}/folders`);
}

export async function createTeamFolder(teamId: string, name: string) {
  return api.post<Folder>(`/team/${teamId}/folders`, { name });
}

export async function renameTeamFolder(
  teamId: string,
  folderId: string,
  name: string,
) {
  return api.patch<Folder>(`/team/${teamId}/folders/${folderId}`, { name });
}

export async function deleteTeamFolder(teamId: string, folderId: string) {
  return api.delete<void>(`/team/${teamId}/folders/${folderId}`);
}

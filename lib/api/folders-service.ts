import { api } from "./base";

export interface Folder {
  id: string;
  name: string;
  userId: string | null;
  teamId: string | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}

export const MAX_TAGS = 6;
export const MAX_TAG_LEN = 32;

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

export async function setNotebookTags(notebookId: string, tags: string[]) {
  return api.patch<void>(`/notebook/${notebookId}/tags`, { tags });
}

export async function setFolderTags(folderId: string, tags: string[]) {
  return api.patch<Folder>(`/notebook/folders/${folderId}/tags`, { tags });
}

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

export async function setTeamFolderTags(
  teamId: string,
  folderId: string,
  tags: string[],
) {
  return api.patch<Folder>(`/team/${teamId}/folders/${folderId}/tags`, { tags });
}

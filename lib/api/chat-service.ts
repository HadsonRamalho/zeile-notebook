import { api } from "./base";

export interface ChatMessageDTO {
  id: string;
  notebookId: string | null;
  teamId: string | null;
  userId: string | null;
  authorName: string;
  content: string;
  parentId: string | null;
  quotedMessageId: string | null;
  isEdited: boolean;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface ChatMessageVersionDTO {
  id: string;
  messageId: string;
  content: string;
  createdAt: string;
}

export interface SendMessagePayload {
  content: string;
  parentId?: string | null;
  quotedMessageId?: string | null;
}

export async function fetchNotebookMessages(notebookId: string) {
  return api.get<ChatMessageDTO[]>(`/notebook/${notebookId}/chat/messages`);
}

export async function sendNotebookMessage(
  notebookId: string,
  payload: SendMessagePayload,
) {
  return api.post<ChatMessageDTO>(
    `/notebook/${notebookId}/chat/messages`,
    payload,
  );
}

export async function editNotebookMessage(
  notebookId: string,
  messageId: string,
  content: string,
) {
  return api.patch<ChatMessageDTO>(
    `/notebook/${notebookId}/chat/messages/${messageId}`,
    { content },
  );
}

export async function editTeamMessage(
  teamId: string,
  messageId: string,
  content: string,
) {
  return api.patch<ChatMessageDTO>(
    `/team/${teamId}/chat/messages/${messageId}`,
    { content },
  );
}

export async function fetchNotebookMessageVersions(
  notebookId: string,
  messageId: string,
) {
  return api.get<ChatMessageVersionDTO[]>(
    `/notebook/${notebookId}/chat/messages/${messageId}/versions`,
  );
}

export async function fetchTeamMessageVersions(
  teamId: string,
  messageId: string,
) {
  return api.get<ChatMessageVersionDTO[]>(
    `/team/${teamId}/chat/messages/${messageId}/versions`,
  );
}

export async function fetchTeamMessages(teamId: string) {
  return api.get<ChatMessageDTO[]>(`/team/${teamId}/chat/messages`);
}

export async function sendTeamMessage(
  teamId: string,
  payload: SendMessagePayload,
) {
  return api.post<ChatMessageDTO>(`/team/${teamId}/chat/messages`, payload);
}

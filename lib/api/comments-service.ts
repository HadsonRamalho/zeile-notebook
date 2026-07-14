import type {
  Comment,
  CommentThread,
  CommentThreadStatus,
} from "../types/comment-types";
import { api } from "./base";

export async function listComments(notebookId: string) {
  return api.get<CommentThread[]>(`/notebook/${notebookId}/comments`);
}

export async function createCommentThread(
  notebookId: string,
  input: { blockId: string; anchorOffset?: number | null; body: string },
) {
  return api.post<CommentThread>(`/notebook/${notebookId}/comments`, input);
}

export async function replyToThread(
  notebookId: string,
  threadId: string,
  body: string,
) {
  return api.post<Comment>(
    `/notebook/${notebookId}/comments/threads/${threadId}/replies`,
    { body },
  );
}

export async function updateThreadStatus(
  notebookId: string,
  threadId: string,
  status: CommentThreadStatus,
) {
  return api.patch<CommentThread>(
    `/notebook/${notebookId}/comments/threads/${threadId}`,
    { status },
  );
}

export async function deleteComment(notebookId: string, commentId: string) {
  return api.delete(`/notebook/${notebookId}/comments/${commentId}`);
}

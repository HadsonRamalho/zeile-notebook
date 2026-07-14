export interface Comment {
  id: string;
  threadId: string;
  authorId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type CommentThreadStatus = "open" | "resolved";

export interface CommentThread {
  id: string;
  notebookId: string;
  blockId: string;
  anchorOffset: number | null;
  status: CommentThreadStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  comments: Comment[];
}

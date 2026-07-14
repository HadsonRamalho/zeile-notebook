export type ActivityKind = "edit" | "comment" | "snapshot" | "publish";

export interface Activity {
  id: string;
  notebookId: string;
  actorId: string | null;
  actorName: string;
  kind: string;
  blockId: string | null;
  summary: string | null;
  createdAt: string;
}

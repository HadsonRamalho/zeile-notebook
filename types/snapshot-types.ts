export interface SnapshotMeta {
  id: string;
  notebookId: string;
  label: string;
  note: string | null;
  kind: string;
  createdBy: string | null;
  createdAt: string;
}

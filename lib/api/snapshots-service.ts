import type { SnapshotMeta } from "@/types/snapshot-types";
import { createApi } from "./base";

const api = createApi("snapshots");

export async function listSnapshots(notebookId: string) {
  return api.get<SnapshotMeta[]>(`/notebook/${notebookId}/snapshots`);
}

export async function createSnapshot(
  notebookId: string,
  label: string,
  note?: string | null,
) {
  return api.post<SnapshotMeta>(`/notebook/${notebookId}/snapshots`, {
    label,
    note: note ?? null,
  });
}

export async function restoreSnapshot(notebookId: string, snapshotId: string) {
  return api.post(
    `/notebook/${notebookId}/snapshots/${snapshotId}/restore`,
    {},
  );
}

export async function deleteSnapshot(notebookId: string, snapshotId: string) {
  return api.delete(`/notebook/${notebookId}/snapshots/${snapshotId}`);
}

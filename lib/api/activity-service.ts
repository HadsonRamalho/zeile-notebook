import type { Activity } from "@/types/activity-types";
import { createResultApi } from "./base";

const api = createResultApi("activity");

export async function listActivity(notebookId: string) {
  return api.get<Activity[]>(`/notebook/${notebookId}/activity`);
}

export async function recordEditActivity(
  notebookId: string,
  blockId?: string | null,
) {
  return api.post(`/notebook/${notebookId}/activity`, {
    blockId: blockId ?? null,
  });
}

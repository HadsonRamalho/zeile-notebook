import { del, get, set } from "idb-keyval";

export const BACKGROUND_SYNC_QUEUE_KEY = "zeile-background-sync-queue";
export const BACKGROUND_SYNC_TAG = "zeile-retry-queue";

export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

export async function getQueuedRequests(): Promise<QueuedRequest[]> {
  return (await get<QueuedRequest[]>(BACKGROUND_SYNC_QUEUE_KEY)) ?? [];
}

export async function removeQueuedRequest(id: string): Promise<void> {
  const current = await getQueuedRequests();
  await set(
    BACKGROUND_SYNC_QUEUE_KEY,
    current.filter((req) => req.id !== id),
  );
}

export async function clearQueuedRequests(): Promise<void> {
  await del(BACKGROUND_SYNC_QUEUE_KEY);
}

export async function queueRequest(
  url: string,
  init: RequestInit,
): Promise<void> {
  const current = await getQueuedRequests();
  const headers: Record<string, string> = {};
  if (init.headers) {
    for (const [key, value] of Object.entries(
      init.headers as Record<string, string>,
    )) {
      headers[key] = value;
    }
  }

  current.push({
    id: crypto.randomUUID(),
    url,
    method: init.method ?? "GET",
    headers,
    body: typeof init.body === "string" ? init.body : null,
  });
  await set(BACKGROUND_SYNC_QUEUE_KEY, current);

  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator) || !("SyncManager" in window)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    await (registration as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register(
      BACKGROUND_SYNC_TAG,
    );
  } catch {}
}

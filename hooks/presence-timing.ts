export const PRESENCE_HEARTBEAT_MS = 10000;
export const PRESENCE_STALE_MS = 30000;
export const PRESENCE_PRUNE_INTERVAL_MS = 3000;
export const CURSOR_THROTTLE_MS = 100;

export function shouldSendCursor(now: number, lastSentAt: number) {
  return now - lastSentAt >= CURSOR_THROTTLE_MS;
}

export function isStale(now: number, lastSeenAt: number) {
  return now - lastSeenAt > PRESENCE_STALE_MS;
}

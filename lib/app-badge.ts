export function updateAppBadge(count: number): void {
  if (typeof navigator === "undefined") return;
  if (!navigator.setAppBadge || !navigator.clearAppBadge) return;

  if (count > 0) {
    navigator.setAppBadge(count).catch(() => {});
  } else {
    navigator.clearAppBadge().catch(() => {});
  }
}

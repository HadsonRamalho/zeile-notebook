const STORAGE_KEY = "zeile:pending-import";

export function setPendingImport(content: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, content);
}

export function consumePendingImport(): string | null {
  if (typeof window === "undefined") return null;
  const content = window.sessionStorage.getItem(STORAGE_KEY);
  if (content === null) return null;
  window.sessionStorage.removeItem(STORAGE_KEY);
  return content;
}

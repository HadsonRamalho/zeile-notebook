import { readStorage, removeStorage, writeStorage } from "@/lib/safe-storage";

const STORAGE_KEY = "zeile:pending-import";

export function setPendingImport(content: string): void {
  writeStorage(STORAGE_KEY, content, "session");
}

export function consumePendingImport(): string | null {
  const content = readStorage(STORAGE_KEY, "session");
  if (content === null) return null;
  removeStorage(STORAGE_KEY, "session");
  return content;
}

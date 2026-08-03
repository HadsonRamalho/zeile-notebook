// Web Storage access that never throws. Firefox raises a SecurityError
// ("The operation is insecure") when the site lacks storage permission,
// and a throw inside an effect crashes the whole route.

type StorageKind = "local" | "session";

function store(kind: StorageKind): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStorage(key: string, kind: StorageKind = "local") {
  try {
    return store(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorage(
  key: string,
  value: string,
  kind: StorageKind = "local",
) {
  try {
    store(kind)?.setItem(key, value);
  } catch {}
}

export function removeStorage(key: string, kind: StorageKind = "local") {
  try {
    store(kind)?.removeItem(key);
  } catch {}
}

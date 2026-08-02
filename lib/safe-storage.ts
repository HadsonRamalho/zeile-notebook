// Acesso a Web Storage que nunca lança. Firefox emite SecurityError
// ("The operation is insecure") quando o site está sem permissão de storage,
// e um throw dentro de um efeito derruba a rota inteira.

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

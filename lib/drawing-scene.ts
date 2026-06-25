import type { DrawingElement, Notebook } from "@/lib/types";

// Campos voláteis do Excalidraw: mudam a cada reconciliação/render mesmo sem
// alteração visual. Incluí-los na assinatura causaria escalada de versão entre
// peers (loop de eco). São ignorados na comparação de conteúdo.
const VOLATILE_KEYS = new Set(["version", "versionNonce", "updated", "seed"]);

function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => !VOLATILE_KEYS.has(k))
    .sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function readSceneElements(
  doc: Notebook | null,
  blockId: string,
): DrawingElement[] {
  const block = doc?.blocks?.find((b) => b.id === blockId);
  const elements = block?.scene?.elements;
  return elements ? (Object.values(elements) as DrawingElement[]) : [];
}

export function writeSceneElements(
  d: Notebook,
  blockId: string,
  elements: readonly DrawingElement[],
): void {
  const block = d.blocks?.find((b) => b.id === blockId);
  if (!block) return;
  if (!block.scene) block.scene = { elements: {} };
  const scene = block.scene.elements;

  const incoming = new Set(elements.map((e) => e.id));
  for (const id of Object.keys(scene)) {
    if (!incoming.has(id)) delete scene[id];
  }
  for (const el of elements) {
    const cur = scene[el.id];
    // Só reescreve quando o conteúdo (excluindo campos voláteis) muda, para
    // não difundir bumps de versão sem alteração real.
    if (!cur || stableStringify(cur) !== stableStringify(el)) {
      scene[el.id] = JSON.parse(JSON.stringify(el));
    }
  }
}

// Assinatura baseada em conteúdo (independe de version/versionNonce/updated/seed
// e da ordem de chaves após o round-trip no CRDT). Inclui isDeleted, então uma
// remoção conta como mudança.
export function sceneSignature(els: readonly DrawingElement[]): string {
  return els
    .map((e) => stableStringify(e))
    .sort()
    .join("|");
}

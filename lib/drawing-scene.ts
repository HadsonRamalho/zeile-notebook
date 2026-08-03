import type { DrawingElement, Notebook } from "@/lib/types";

// Excalidraw's volatile fields: change on every reconciliation/render even
// without a visual change. Including them in the signature would cause a
// version-bump escalation between peers (echo loop). Ignored in content comparison.
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
    // Only rewrites when the content (excluding volatile fields) changes, to
    // avoid broadcasting version bumps without a real change.
    if (!cur || stableStringify(cur) !== stableStringify(el)) {
      scene[el.id] = JSON.parse(JSON.stringify(el));
    }
  }
}

// Content-based signature (independent of version/versionNonce/updated/seed
// and of key order after the CRDT round-trip). Includes isDeleted, so a
// removal counts as a change.
export function sceneSignature(els: readonly DrawingElement[]): string {
  return els
    .map((e) => stableStringify(e))
    .sort()
    .join("|");
}

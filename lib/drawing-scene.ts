import type { DrawingElement, Notebook } from "@/lib/types";

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
    if (!cur || cur.version !== el.version) {
      scene[el.id] = JSON.parse(JSON.stringify(el));
    }
  }
}

export function sceneSignature(els: readonly DrawingElement[]): string {
  return els
    .map((e) => `${e.id}:${e.version}`)
    .sort()
    .join("|");
}

import { type BrushShape, nextElementId } from "./engine";

export interface Brush {
  id: string;
  name: string;
  shape: BrushShape;
  sizeStart: number;
  sizeEnd: number;
  opacityStart: number;
  opacityEnd: number;
  builtin?: boolean;
}

export const brushSize = (b: Brush): number =>
  Math.round(Math.max(b.sizeStart, b.sizeEnd));

/** Reescala start/end preservando a proporção (afinamento) do pincel. */
export const scaleBrushSize = (b: Brush, nextSize: number): Brush => {
  const current = Math.max(b.sizeStart, b.sizeEnd, 0.1);
  const ratio = Math.max(1, nextSize) / current;
  return {
    ...b,
    sizeStart: Math.max(1, Math.round(b.sizeStart * ratio)),
    sizeEnd: Math.max(1, Math.round(b.sizeEnd * ratio)),
  };
};

export const BUILTIN_BRUSHES: Brush[] = [
  { id: "b-pen", name: "Caneta", shape: "pen", sizeStart: 8, sizeEnd: 8, opacityStart: 100, opacityEnd: 100, builtin: true },
  { id: "b-pencil", name: "Lápis", shape: "pencil", sizeStart: 4, sizeEnd: 4, opacityStart: 95, opacityEnd: 95, builtin: true },
  { id: "b-marker", name: "Marcador", shape: "marker", sizeStart: 14, sizeEnd: 14, opacityStart: 70, opacityEnd: 70, builtin: true },
  { id: "b-dot", name: "Ponto", shape: "dot", sizeStart: 10, sizeEnd: 10, opacityStart: 100, opacityEnd: 100, builtin: true },
  { id: "b-airbrush", name: "Aerógrafo", shape: "airbrush", sizeStart: 30, sizeEnd: 30, opacityStart: 100, opacityEnd: 100, builtin: true },
  { id: "b-watercolor", name: "Pincel de água", shape: "watercolor", sizeStart: 26, sizeEnd: 26, opacityStart: 60, opacityEnd: 60, builtin: true },
  { id: "b-oil", name: "Óleo", shape: "oil", sizeStart: 18, sizeEnd: 18, opacityStart: 100, opacityEnd: 100, builtin: true },
  { id: "b-charcoal", name: "Carvão", shape: "charcoal", sizeStart: 12, sizeEnd: 12, opacityStart: 90, opacityEnd: 90, builtin: true },
  { id: "b-chalk", name: "Giz", shape: "chalk", sizeStart: 12, sizeEnd: 12, opacityStart: 85, opacityEnd: 85, builtin: true },
];

const STORAGE_KEY = "free-drawing-custom-brushes";

export function loadCustomBrushes(): Brush[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Brush[];
    return Array.isArray(parsed) ? parsed.map((b) => ({ ...b, builtin: false })) : [];
  } catch {
    return [];
  }
}

export function saveCustomBrushes(brushes: Brush[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(brushes.filter((b) => !b.builtin)),
    );
  } catch {}
}

export function makeCustomBrush(init: Omit<Brush, "id" | "builtin">): Brush {
  return { ...init, id: nextElementId("brush"), builtin: false };
}

import { catchError } from "@catcherjs/core";
import {
  computeContentBounds,
  defaultCanvasSettings,
  exportSceneToCanvas,
  type FreeDrawingElement,
  isCanvasSettings,
  isLayer,
  isStroke,
} from "@/features/notebook/components/blocks/free-drawing/engine";
import { readSceneElements } from "@/features/notebook/lib/drawing-scene";
import type { Block } from "@/types/block-types";
import type { Notebook } from "@/types/notebook-types";
import type { AssetRef } from "./to-markdown";

export interface ExportFile {
  name: string;
  blob: Blob;
}

export interface BlockAsset {
  ref: AssetRef;
  files: ExportFile[];
}

const VISUAL_TYPES = new Set<Block["type"]>([
  "drawing",
  "free_drawing",
  "database_schema",
  "typst",
]);

export function blockProducesAsset(block: Block): boolean {
  return VISUAL_TYPES.has(block.type);
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "bloco";
}

function blockNode(blockId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
}

async function renderFreeDrawing(
  notebook: Notebook,
  block: Block,
): Promise<BlockAsset | null> {
  const els = readSceneElements(
    notebook,
    block.id,
  ) as unknown as FreeDrawingElement[];
  const layers = els.filter(isLayer);
  const strokes = els.filter(isStroke);
  const settings = els.find(isCanvasSettings) ?? defaultCanvasSettings();
  const bounds = computeContentBounds(strokes);
  if (!bounds) return null;
  const canvas = exportSceneToCanvas(layers, strokes, bounds, 16, 2, {
    mode: settings.backgroundMode,
    color: settings.backgroundColor,
  });
  const blob = await canvasToBlob(canvas);
  if (!blob) return null;
  const name = `${safeId(block.id)}.png`;
  return {
    ref: { path: `assets/${name}`, kind: "image" },
    files: [{ name, blob }],
  };
}

async function renderExcalidraw(
  notebook: Notebook,
  block: Block,
): Promise<BlockAsset | null> {
  const els = readSceneElements(notebook, block.id);
  if (els.length === 0) return null;
  const { exportToBlob } = await import("@excalidraw/excalidraw");
  type ExportToBlobOpts = Parameters<typeof exportToBlob>[0];
  const blob = await exportToBlob({
    elements: els as unknown as ExportToBlobOpts["elements"],
    files: null,
    mimeType: "image/png",
    appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
    exportPadding: 16,
  });
  const name = `${safeId(block.id)}.png`;
  return {
    ref: { path: `assets/${name}`, kind: "image" },
    files: [{ name, blob }],
  };
}

async function renderDiagram(block: Block): Promise<BlockAsset | null> {
  const node = blockNode(block.id);
  if (!node) return null;
  const target = node.querySelector<HTMLElement>(".react-flow") ?? node;
  const { toBlob } = await import("html-to-image");
  const blob = await toBlob(target, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    filter: (el) =>
      !(el instanceof HTMLElement && el.dataset.exportExclude === "true"),
  });
  if (!blob) return null;
  const name = `${safeId(block.id)}.png`;
  const files: ExportFile[] = [{ name, blob }];
  if (block.content.trim()) {
    files.push({
      name: `${safeId(block.id)}.dbml`,
      blob: new Blob([block.content], { type: "text/plain" }),
    });
  }
  return { ref: { path: `assets/${name}`, kind: "image" }, files };
}

async function renderTypst(block: Block): Promise<BlockAsset | null> {
  const { getTypst } = await import("@/stores/typst-store");
  const typst = await getTypst();
  const bytes = await typst.pdf({ mainContent: block.content });
  if (!bytes) return null;
  const base = safeId(block.id);
  const pdfName = `${base}.pdf`;
  return {
    ref: { path: `assets/${pdfName}`, kind: "file" },
    files: [
      {
        name: pdfName,
        blob: new Blob([bytes as BlobPart], { type: "application/pdf" }),
      },
      {
        name: `${base}.typst`,
        blob: new Blob([block.content], { type: "text/plain" }),
      },
    ],
  };
}

export async function renderBlockAsset(
  notebook: Notebook,
  block: Block,
): Promise<BlockAsset | null> {
  const result = await catchError(
    (async () => {
      switch (block.type) {
        case "free_drawing":
          return await renderFreeDrawing(notebook, block);
        case "drawing":
          return await renderExcalidraw(notebook, block);
        case "database_schema":
          return await renderDiagram(block);
        case "typst":
          return await renderTypst(block);
        default:
          return null;
      }
    })(),
  );
  return result.isOk() ? result.data : null;
}

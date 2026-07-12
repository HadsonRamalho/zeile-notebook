import type { Block, Notebook } from "@/lib/types";
import { renderBlockAsset } from "./assets";

function blockNode(blockId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function blockImage(
  notebook: Notebook,
  block: Block,
): Promise<string | null> {
  if (
    block.type === "free_drawing" ||
    block.type === "drawing" ||
    block.type === "database_schema"
  ) {
    const asset = await renderBlockAsset(notebook, block);
    if (asset && asset.ref.kind === "image" && asset.files[0]) {
      return blobToDataUrl(asset.files[0].blob);
    }
  }
  const node = blockNode(block.id);
  if (!node) return null;
  const { toCanvas } = await import("html-to-image");
  const canvas = await toCanvas(node, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    filter: (el) =>
      !(el instanceof HTMLElement && el.dataset.exportExclude === "true"),
  });
  return canvas.toDataURL("image/png");
}

function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export async function notebookToPdfBlob(notebook: Notebook): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 12;
  const contentW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  let y = margin;

  doc.setFontSize(20);
  doc.text(notebook.title || "Caderno", margin, y + 6);
  y += 14;

  for (const block of notebook.blocks) {
    const dataUrl = await blockImage(notebook, block);
    if (!dataUrl) continue;
    const { w, h } = await imageSize(dataUrl);
    if (w === 0 || h === 0) continue;

    let drawW = contentW;
    let drawH = (h / w) * drawW;
    if (drawH > maxH) {
      drawH = maxH;
      drawW = (w / h) * drawH;
    }
    if (y + drawH > pageH - margin) {
      doc.addPage();
      y = margin;
    }
    doc.addImage(dataUrl, "PNG", margin, y, drawW, drawH);
    y += drawH + 6;
  }

  return doc.output("blob");
}

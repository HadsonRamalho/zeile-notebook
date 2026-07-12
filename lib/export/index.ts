import type { Block, Notebook } from "@/lib/types";
import { blockProducesAsset, renderBlockAsset } from "./assets";
import { type AssetRef, notebookToMarkdown } from "./to-markdown";
import { notebookToPdfBlob } from "./to-pdf";

export type ExportFormat =
  | "markdown"
  | "markdown_assets"
  | "pdf"
  | "json"
  | "json_assets";

export const EXPORT_PERMISSION: Record<ExportFormat, string> = {
  markdown: "notebook.export.markdown",
  markdown_assets: "notebook.export.markdown_assets",
  pdf: "notebook.export.pdf",
  json: "notebook.export.json",
  json_assets: "notebook.export.json_assets",
};

function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "caderno"
  );
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function collectAssets(notebook: Notebook): Promise<{
  refs: Map<string, AssetRef>;
  files: { name: string; blob: Blob }[];
}> {
  const refs = new Map<string, AssetRef>();
  const files: { name: string; blob: Blob }[] = [];
  for (const block of notebook.blocks) {
    if (!blockProducesAsset(block)) continue;
    const asset = await renderBlockAsset(notebook, block);
    if (!asset) continue;
    refs.set(block.id, asset.ref);
    files.push(...asset.files);
  }
  return { refs, files };
}

async function zipWith(
  entries: { path: string; data: Blob | string }[],
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const entry of entries) zip.file(entry.path, entry.data);
  return zip.generateAsync({ type: "blob" });
}

export async function exportNotebook(
  notebook: Notebook,
  format: ExportFormat,
): Promise<void> {
  const name = slug(notebook.title || "caderno");

  switch (format) {
    case "markdown": {
      const md = notebookToMarkdown(notebook);
      download(new Blob([md], { type: "text/markdown" }), `${name}.md`);
      return;
    }
    case "markdown_assets": {
      const { refs, files } = await collectAssets(notebook);
      const md = notebookToMarkdown(
        notebook,
        (b: Block) => refs.get(b.id) ?? null,
      );
      const entries: { path: string; data: Blob | string }[] = [
        { path: `${name}.md`, data: md },
        ...files.map((f) => ({ path: `assets/${f.name}`, data: f.blob })),
      ];
      download(await zipWith(entries), `${name}.zip`);
      return;
    }
    case "pdf": {
      const blob = await notebookToPdfBlob(notebook);
      download(blob, `${name}.pdf`);
      return;
    }
    case "json": {
      const json = JSON.stringify(notebook, null, 2);
      download(new Blob([json], { type: "application/json" }), `${name}.json`);
      return;
    }
    case "json_assets": {
      const { files } = await collectAssets(notebook);
      const entries: { path: string; data: Blob | string }[] = [
        { path: `${name}.json`, data: JSON.stringify(notebook, null, 2) },
        ...files.map((f) => ({ path: `assets/${f.name}`, data: f.blob })),
      ];
      download(await zipWith(entries), `${name}.zip`);
      return;
    }
  }
}

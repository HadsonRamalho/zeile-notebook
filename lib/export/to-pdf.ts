import type { jsPDF } from "jspdf";
import type { Block, Notebook } from "@/lib/types";
import { renderBlockAsset } from "./assets";

const PT2MM = 0.352778;

interface Ctx {
  doc: jsPDF;
  pageW: number;
  pageH: number;
  margin: number;
  contentW: number;
  y: number;
}

type Run = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
};

function ensureSpace(ctx: Ctx, h: number) {
  if (ctx.y + h > ctx.pageH - ctx.margin) {
    ctx.doc.addPage();
    ctx.y = ctx.margin;
  }
}

function tokenizeInline(text: string): Run[] {
  const runs: Run[] = [];
  const push = (t: string, fmt: Partial<Run>) => {
    if (t) runs.push({ text: t, ...fmt });
  };
  const regex =
    /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null = regex.exec(text);
  while (m !== null) {
    if (m.index > last) push(text.slice(last, m.index), {});
    const tok = m[0];
    if (tok.startsWith("**") || tok.startsWith("__")) {
      push(tok.slice(2, -2), { bold: true });
    } else if (tok.startsWith("~~")) {
      push(tok.slice(2, -2), { strike: true });
    } else if (tok.startsWith("`")) {
      push(tok.slice(1, -1), { code: true });
    } else if (tok.startsWith("[")) {
      const mm = tok.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      push(mm ? mm[1]! : tok, {});
    } else {
      push(tok.slice(1, -1), { italic: true });
    }
    last = m.index + tok.length;
    m = regex.exec(text);
  }
  if (last < text.length) push(text.slice(last), {});
  if (runs.length === 0) runs.push({ text: "" });
  return runs;
}

function setRunFont(doc: jsPDF, run: Run, size: number, forceBold: boolean) {
  const bold = run.bold || forceBold;
  if (run.code) {
    doc.setFont("courier", bold ? "bold" : "normal");
  } else {
    const style =
      bold && run.italic
        ? "bolditalic"
        : bold
          ? "bold"
          : run.italic
            ? "italic"
            : "normal";
    doc.setFont("helvetica", style);
  }
  doc.setFontSize(size);
}

function drawRuns(
  ctx: Ctx,
  runs: Run[],
  opts: {
    size?: number;
    indent?: number;
    hangingIndent?: number;
    color?: [number, number, number];
    gapAfter?: number;
    forceBold?: boolean;
    forceItalic?: boolean;
  } = {},
) {
  const { doc } = ctx;
  const size = opts.size ?? 11;
  const indent = opts.indent ?? 0;
  const hanging = opts.hangingIndent ?? 0;
  const gapAfter = opts.gapAfter ?? 2.5;
  const lineH = size * PT2MM * 1.35;
  const startX = ctx.margin + indent;
  const contX = startX + hanging;
  const maxX = ctx.margin + ctx.contentW;
  doc.setTextColor(...(opts.color ?? [30, 30, 30]));

  ensureSpace(ctx, lineH);
  let x = startX;
  let firstLine = true;
  const newline = () => {
    ctx.y += lineH;
    ensureSpace(ctx, lineH);
    x = contX;
    firstLine = false;
  };

  for (const run of runs) {
    const effective = opts.forceItalic ? { ...run, italic: true } : run;
    setRunFont(doc, effective, size, opts.forceBold ?? false);
    const parts = effective.text.split(/(\s+)/);
    for (const part of parts) {
      if (part === "") continue;
      const w = doc.getTextWidth(part);
      if (/^\s+$/.test(part)) {
        if (x > (firstLine ? startX : contX)) {
          if (x + w > maxX) newline();
          else x += w;
        }
        continue;
      }
      if (x + w > maxX && x > (firstLine ? startX : contX)) newline();
      doc.text(part, x, ctx.y, { baseline: "top" });
      if (effective.strike) {
        doc.setDrawColor(...(opts.color ?? [30, 30, 30]));
        doc.setLineWidth(0.3);
        doc.line(x, ctx.y + lineH * 0.45, x + w, ctx.y + lineH * 0.45);
      }
      x += w;
    }
  }
  ctx.y += lineH + gapAfter;
}

function renderCodeBlock(ctx: Ctx, code: string) {
  const { doc } = ctx;
  const size = 9;
  const lineH = size * PT2MM * 1.4;
  const indent = 2;
  doc.setFont("courier", "normal");
  doc.setFontSize(size);
  doc.setTextColor(55, 65, 81);
  ctx.y += 1;
  const lines = code.replace(/\n+$/, "").split("\n");
  for (const raw of lines) {
    const wrapped = doc.splitTextToSize(
      raw === "" ? " " : raw,
      ctx.contentW - indent * 2,
    ) as string[];
    for (const wl of wrapped) {
      ensureSpace(ctx, lineH);
      doc.text(wl, ctx.margin + indent, ctx.y, { baseline: "top" });
      ctx.y += lineH;
    }
  }
  ctx.y += 3;
}

function renderHr(ctx: Ctx) {
  ensureSpace(ctx, 4);
  ctx.doc.setDrawColor(210, 210, 210);
  ctx.doc.setLineWidth(0.2);
  ctx.doc.line(ctx.margin, ctx.y + 1.5, ctx.margin + ctx.contentW, ctx.y + 1.5);
  ctx.y += 4;
}

const HEADING_SIZE = [0, 19, 16, 14, 12.5, 11.5, 11];

function renderMarkdown(ctx: Ctx, md: string) {
  const lines = md.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) {
        code.push(lines[i]!);
        i++;
      }
      i++;
      renderCodeBlock(ctx, code.join("\n"));
      continue;
    }
    if (trimmed === "") {
      ctx.y += 1.5;
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      renderHr(ctx);
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1]!.length;
      drawRuns(ctx, tokenizeInline(heading[2]!), {
        size: HEADING_SIZE[level] ?? 11,
        forceBold: true,
        gapAfter: 3,
      });
      i++;
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      drawRuns(ctx, tokenizeInline(quote[1]!), {
        indent: 5,
        forceItalic: true,
        color: [90, 90, 90],
      });
      i++;
      continue;
    }
    const ul = line.match(/^[-*+]\s+(.*)$/);
    if (ul) {
      drawRuns(ctx, [{ text: "•  " }, ...tokenizeInline(ul[1]!)], {
        indent: 4,
        hangingIndent: 4,
      });
      i++;
      continue;
    }
    const ol = line.match(/^(\d+)\.\s+(.*)$/);
    if (ol) {
      drawRuns(ctx, [{ text: `${ol[1]}.  ` }, ...tokenizeInline(ol[2]!)], {
        indent: 4,
        hangingIndent: 5,
      });
      i++;
      continue;
    }
    drawRuns(ctx, tokenizeInline(line));
    i++;
  }
}

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

function imageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function renderImageBlock(ctx: Ctx, notebook: Notebook, block: Block) {
  let dataUrl: string | null = null;
  const asset = await renderBlockAsset(notebook, block);
  if (asset && asset.ref.kind === "image" && asset.files[0]) {
    dataUrl = await blobToDataUrl(asset.files[0].blob);
  } else {
    const node = blockNode(block.id);
    if (!node) return;
    const target =
      node.querySelector<HTMLElement>("svg, canvas, .react-flow") ?? node;
    const { toCanvas } = await import("html-to-image");
    const canvas = await toCanvas(target, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
    });
    dataUrl = canvas.toDataURL("image/png");
  }
  if (!dataUrl) return;
  const { w, h } = await imageSize(dataUrl);
  if (w === 0 || h === 0) return;
  let drawW = ctx.contentW;
  let drawH = (h / w) * drawW;
  const maxH = ctx.pageH - ctx.margin * 2;
  if (drawH > maxH) {
    drawH = maxH;
    drawW = (w / h) * drawH;
  }
  if (ctx.y + drawH > ctx.pageH - ctx.margin) {
    ctx.doc.addPage();
    ctx.y = ctx.margin;
  }
  ctx.doc.addImage(dataUrl, "PNG", ctx.margin, ctx.y, drawW, drawH);
  ctx.y += drawH + 4;
}

async function renderBlock(ctx: Ctx, notebook: Notebook, block: Block) {
  switch (block.type) {
    case "text":
      renderMarkdown(ctx, block.content);
      return;
    case "code":
    case "sql":
    case "latex":
      renderCodeBlock(ctx, block.content);
      return;
    case "component": {
      const meta = block.metadata;
      if (meta?.type === "card") {
        drawRuns(ctx, [{ text: meta.props.title }], {
          size: 14,
          forceBold: true,
          gapAfter: 1.5,
        });
        if (meta.props.description) {
          drawRuns(ctx, tokenizeInline(meta.props.description));
        }
        return;
      }
      renderMarkdown(ctx, block.content);
      return;
    }
    case "drawing":
    case "free_drawing":
    case "database_schema":
    case "typst":
      await renderImageBlock(ctx, notebook, block);
      return;
    default:
      renderMarkdown(ctx, block.content);
  }
}

export async function notebookToPdfBlob(notebook: Notebook): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const ctx: Ctx = {
    doc,
    pageW: doc.internal.pageSize.getWidth(),
    pageH: doc.internal.pageSize.getHeight(),
    margin: 16,
    contentW: doc.internal.pageSize.getWidth() - 32,
    y: 16,
  };

  drawRuns(ctx, [{ text: notebook.title || "Caderno" }], {
    size: 24,
    forceBold: true,
    gapAfter: 5,
  });

  for (const block of notebook.blocks) {
    await renderBlock(ctx, notebook, block);
  }

  return doc.output("blob");
}

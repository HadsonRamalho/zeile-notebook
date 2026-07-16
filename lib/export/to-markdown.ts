import { contentToMermaidText } from "@/lib/mermaid-graph";
import type { Block, Notebook } from "@/lib/types";

export type AssetRef = { path: string; kind: "image" | "file" };
export type AssetResolver = (block: Block) => AssetRef | null;

// callout type -> GitHub-flavored-markdown alert
const GFM_ALERT: Record<string, string> = {
  info: "NOTE",
  idea: "TIP",
  warn: "WARNING",
  warning: "WARNING",
  error: "CAUTION",
  success: "IMPORTANT",
};

function codeLanguage(block: Block): string {
  if (block.language && block.language !== "generic") return block.language;
  if (block.metadata?.type === "generic") {
    const lang = block.metadata.props?.language;
    if (typeof lang === "string") return lang;
  }
  return "";
}

function fence(lang: string, code: string): string {
  return `\`\`\`${lang}\n${code.replace(/\n+$/, "")}\n\`\`\``;
}

function componentToMarkdown(block: Block): string {
  const meta = block.metadata;
  const body = block.content.trim();

  if (meta?.type === "callout") {
    const alert = GFM_ALERT[meta.props?.type ?? "info"] ?? "NOTE";
    const quoted = (body || "")
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    return `> [!${alert}]\n${quoted}`.trimEnd();
  }
  if (meta?.type === "card") {
    const { title, description, href } = meta.props;
    const heading = href ? `### [${title}](${href})` : `### ${title}`;
    return description ? `${heading}\n\n${description}` : heading;
  }
  if (meta?.type === "github_repo") {
    const { owner, repo } = meta.props;
    return `### [${owner}/${repo}](https://github.com/${owner}/${repo})`;
  }
  return body;
}

function blockToMarkdown(block: Block, asset: AssetRef | null): string {
  const title = block.title?.trim();
  switch (block.type) {
    case "text":
      return block.content.trim();
    case "code":
      return fence(codeLanguage(block), block.content);
    case "sql":
      return fence("sql", block.content);
    case "mermaid":
      return fence("mermaid", contentToMermaidText(block.content));
    case "latex":
      return `$$\n${block.content.trim()}\n$$`;
    case "database_schema":
      return asset
        ? `![${title || "Diagrama"}](${asset.path})`
        : fence("dbml", block.content);
    case "typst":
      return asset
        ? `[📄 ${title || "Documento Typst"}](${asset.path})`
        : fence("typst", block.content);
    case "drawing":
    case "free_drawing":
      return asset
        ? `![${title || "Desenho"}](${asset.path})`
        : `> _${title || "Desenho"} — exporte como “Markdown + imagens” para incluir a figura._`;
    case "component":
      return componentToMarkdown(block);
    default:
      return block.content.trim();
  }
}

export function notebookToMarkdown(
  notebook: Notebook,
  resolveAsset?: AssetResolver,
): string {
  const parts: string[] = [`# ${notebook.title || "Caderno"}`, ""];
  for (const block of notebook.blocks) {
    const md = blockToMarkdown(block, resolveAsset?.(block) ?? null);
    if (md.trim()) parts.push(md, "");
  }
  return `${parts
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}

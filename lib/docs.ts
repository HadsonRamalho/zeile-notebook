import fs from "node:fs";
import path from "node:path";
import Slugger from "github-slugger";
import type { TOCItemType } from "./utils";

const DOCS_DIR = path.join(process.cwd(), "content/docs");

export interface DocFrontmatter {
  title: string;
  description?: string;
}

export interface DocPage {
  slugs: string[];
  url: string;
  filePath: string;
  frontmatter: DocFrontmatter;
}

export type PageTreeNode =
  | { type: "page"; name: string; url: string }
  | {
      type: "folder";
      name: string;
      index?: PageTreeNode;
      children: PageTreeNode[];
    };

export interface PageTree {
  name: string;
  children: PageTreeNode[];
}

function parseFrontmatter(raw: string): {
  frontmatter: DocFrontmatter;
  content: string;
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: { title: "" }, content: raw };

  const [, rawFrontmatter, content] = match;
  const frontmatter: Record<string, string> = {};

  for (const line of rawFrontmatter.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    frontmatter[key] = value;
  }

  return {
    frontmatter: {
      title: frontmatter.title ?? "",
      description: frontmatter.description,
    },
    content,
  };
}

function walk(dir: string, slugs: string[] = []): DocPage[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const pages: DocPage[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      pages.push(...walk(path.join(dir, entry.name), [...slugs, entry.name]));
      continue;
    }

    if (!entry.name.endsWith(".mdx")) continue;

    const filePath = path.join(dir, entry.name);
    const raw = fs.readFileSync(filePath, "utf-8");
    const { frontmatter } = parseFrontmatter(raw);

    const isIndex = entry.name === "index.mdx";
    const pageSlugs = isIndex
      ? slugs
      : [...slugs, entry.name.replace(/\.mdx$/, "")];

    pages.push({
      slugs: pageSlugs,
      url: `/docs${pageSlugs.length ? `/${pageSlugs.join("/")}` : ""}`,
      filePath,
      frontmatter,
    });
  }

  return pages;
}

export function getDocPages(): DocPage[] {
  return walk(DOCS_DIR);
}

export function getDocPage(slugs: string[]): DocPage | undefined {
  const target = slugs.join("/");
  return getDocPages().find((page) => page.slugs.join("/") === target);
}

export function getDocSource(page: DocPage): string {
  const raw = fs.readFileSync(page.filePath, "utf-8");
  return parseFrontmatter(raw).content;
}

function buildTree(pages: DocPage[]): PageTree {
  const root: PageTreeNode & { type: "folder" } = {
    type: "folder",
    name: "docs",
    children: [],
  };

  const folders = new Map<string, PageTreeNode & { type: "folder" }>();
  folders.set("", root);

  const sorted = [...pages].sort((a, b) => a.slugs.length - b.slugs.length);

  for (const page of sorted) {
    if (page.slugs.length === 0) {
      root.index = {
        type: "page",
        name: page.frontmatter.title,
        url: page.url,
      };
      continue;
    }

    let parentKey = "";
    for (let i = 0; i < page.slugs.length; i++) {
      const key = page.slugs.slice(0, i + 1).join("/");
      const isLeaf = i === page.slugs.length - 1;
      const parent = folders.get(parentKey)!;

      if (isLeaf) {
        parent.children.push({
          type: "page",
          name: page.frontmatter.title,
          url: page.url,
        });
      } else if (!folders.get(key)) {
        const folder: PageTreeNode & { type: "folder" } = {
          type: "folder",
          name: page.slugs[i],
          children: [],
        };
        folders.set(key, folder);
        parent.children.push(folder);
      }

      parentKey = key;
    }
  }

  return root;
}

export function getPageTree(): PageTree {
  return buildTree(getDocPages());
}

export function getHeadings(markdown: string): TOCItemType[] {
  const slugger = new Slugger();
  const items: TOCItemType[] = [];
  const regex = /^(#{1,6})\s+(.+)$/gm;

  for (const match of markdown.matchAll(regex)) {
    const depth = match[1]?.length ?? 0;
    const title = match[2]?.trim() ?? "";
    items.push({ title, url: `#${slugger.slug(title)}`, depth });
  }

  return items;
}

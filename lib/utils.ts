import { type ClassValue, clsx } from "clsx";
import Slugger from "github-slugger";
import { twMerge } from "tailwind-merge";
import type { Block } from "@/types/block-types";

export interface TOCItemType {
  title: string;
  url: string;
  depth: number;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function extractTOCFromBlocks(blocks: Block[]): TOCItemType[] {
  const slugger = new Slugger();
  const items: TOCItemType[] = [];

  blocks.forEach((block) => {
    if (
      block.type === "text" ||
      (block.type === "component" &&
        block.metadata?.type &&
        ["card", "banner"].includes(block.metadata?.type))
    ) {
      const regex = /^(#{1,6})\s+(.+)$/gm;

      for (const match of block.content.matchAll(regex)) {
        const depth = match[1]?.length ?? 0;
        const title = match[2]?.trim() ?? "";
        const url = `#${slugger.slug(title)}`;

        items.push({
          title,
          url,
          depth,
        });
      }
    }
  });

  return items;
}

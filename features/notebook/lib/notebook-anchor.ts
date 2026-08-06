"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export const BLOCK_ANCHOR_PARAM = "block";

export function buildNotebookHref(notebookId: string, blockId?: string | null) {
  const base = `/notebook/${notebookId}`;
  return blockId ? `${base}?${BLOCK_ANCHOR_PARAM}=${blockId}` : base;
}

function highlightBlock(blockId: string): boolean {
  const el = document.querySelector<HTMLElement>(
    `[data-block-id="${CSS.escape(blockId)}"]`,
  );
  if (!el) return false;

  el.scrollIntoView({ behavior: "smooth", block: "center" });

  const highlightClasses = [
    "ring-2",
    "ring-primary",
    "ring-offset-2",
    "ring-offset-background",
    "rounded-lg",
    "transition-shadow",
  ];
  el.classList.add(...highlightClasses);
  window.setTimeout(() => {
    el.classList.remove(...highlightClasses);
  }, 2000);
  return true;
}

export function useBlockAnchor(ready: boolean) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const blockId = searchParams.get(BLOCK_ANCHOR_PARAM);

  useEffect(() => {
    if (!ready || !blockId) return;

    let attempts = 0;
    let frame = 0;

    const tryScroll = () => {
      if (highlightBlock(blockId) || attempts > 30) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete(BLOCK_ANCHOR_PARAM);
        const query = params.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
        return;
      }
      attempts += 1;
      frame = window.requestAnimationFrame(tryScroll);
    };

    frame = window.requestAnimationFrame(tryScroll);
    return () => window.cancelAnimationFrame(frame);
  }, [ready, blockId, pathname, router, searchParams]);
}

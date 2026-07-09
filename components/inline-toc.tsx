"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { Block } from "@/lib/types";
import { AnchorProvider, TOCItem } from "@/lib/toc";
import { cn, extractTOCFromBlocks, type TOCItemType } from "@/lib/utils";

interface InlineTOCProps {
  blocks?: Block[];
  tocItems?: TOCItemType[];
}

export function InlineTOC({ tocItems, blocks }: InlineTOCProps) {
  const t = useTranslations("toc");

  const [items, setItems] = useState<TOCItemType[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());

  const [markerStyle, setMarkerStyle] = useState({
    top: 0,
    height: 0,
    opacity: 0,
  });

  useEffect(() => {
    if (blocks) {
      setItems(extractTOCFromBlocks(blocks));
      return;
    }
    if (tocItems) {
      setItems(tocItems);
      return;
    }
  }, [blocks, tocItems]);

  useEffect(() => {
    if (!containerRef.current || items.length === 0) return;

    const updateMarker = () => {
      const container = containerRef.current;
      if (!container) return;

      const activeElement = Array.from(itemRefs.current.values()).find(
        (el) => el.getAttribute("data-active") === "true",
      );

      if (activeElement) {
        setMarkerStyle({
          top: activeElement.offsetTop,
          height: activeElement.offsetHeight,
          opacity: 1,
        });
      } else {
        setMarkerStyle((prev) => ({ ...prev, opacity: 0 }));
      }
    };

    const observer = new MutationObserver(updateMarker);
    observer.observe(containerRef.current, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-active"],
    });

    updateMarker();
    window.addEventListener("resize", updateMarker);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateMarker);
    };
  }, [items]);

  if (items.length === 0) return null;

  return (
    <AnchorProvider toc={items}>
      <div
        ref={containerRef}
        className="flex flex-col max-h-[80vh] overflow-y-auto pr-2 top-24 relative"
      >
        <p className="text-sm font-medium text-muted-foreground mb-4 pl-4">
          {t("title")}
        </p>

        <div className="flex flex-col relative ml-4">
          <div className="absolute left-0 top-0 bottom-0 w-px bg-border/40" />
          <div
            className="absolute left-0 w-0.5 bg-primary rounded-sm transition-all duration-300 ease-out"
            style={{
              top: markerStyle.top,
              height: markerStyle.height,
              opacity: markerStyle.opacity,
            }}
          />

          {items.map((item) => (
            <TOCItem
              key={item.url}
              href={item.url}
              ref={(el) => {
                if (el) itemRefs.current.set(item.url, el);
              }}
              className={cn(
                "py-2 text-sm transition-colors duration-300 block no-underline",
                item.depth <= 2 ? "pl-4" : "pl-8",
                "text-muted-foreground hover:text-foreground",
                "data-[active=true]:text-primary data-[active=true]:font-medium",
              )}
            >
              {item.title}
            </TOCItem>
          ))}
        </div>
      </div>
    </AnchorProvider>
  );
}

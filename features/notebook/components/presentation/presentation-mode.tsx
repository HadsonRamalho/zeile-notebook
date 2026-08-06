"use client";

import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { Block, BlockMetadata, DrawingElement } from "@/types/block-types";
import type { Notebook } from "@/types/notebook-types";
import { BlockContent, useBlockPermissions } from "../blocks/block-content";

interface PresentationModeProps {
  blocks: Block[];
  doc: Notebook | null;
  notebookId: string;
  updateBlock: (id: string, newContent: string) => void;
  updateBlockMetadata: (id: string, newMetadata: BlockMetadata) => void;
  updateDrawingScene: (id: string, elements: readonly DrawingElement[]) => void;
  onClose: () => void;
}

export function PresentationMode({
  blocks,
  doc,
  notebookId,
  updateBlock,
  updateBlockMetadata,
  updateDrawingScene,
  onClose,
}: PresentationModeProps) {
  const t = useTranslations("presentation");
  const total = blocks.length;
  const [index, setIndex] = useState(0);
  const [overview, setOverview] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const clamped = Math.min(index, Math.max(0, total - 1));
  const currentBlock = blocks[clamped];
  const perms = useBlockPermissions(
    currentBlock ?? blocks[0] ?? ({ id: "", type: "text" } as Block),
    false,
  );

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => Math.max(0, Math.min(total - 1, i + delta)));
    },
    [total],
  );

  const toggleFullscreen = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (overview) {
          setOverview(false);
        } else {
          onClose();
        }
        return;
      }
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        if (overview) return;
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (overview) return;
        go(-1);
      } else if (e.key.toLowerCase() === "o") {
        e.preventDefault();
        setOverview((v) => !v);
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overview, go, onClose, toggleFullscreen]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (total === 0) return null;

  return (
    <div className="fixed inset-0 z-fullscreen flex flex-col bg-background">
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5">
        <span className="truncate text-sm font-medium text-foreground">
          {currentBlock?.title || t("untitled_block")}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            {clamped + 1} / {total}
          </span>
          <button
            type="button"
            onClick={() => setOverview((v) => !v)}
            aria-label={t("overview")}
            title={t("overview")}
            className={cn(
              "rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              overview && "bg-accent text-foreground",
            )}
          >
            <LayoutGrid className="size-4" />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={t("fullscreen")}
            title={t("fullscreen")}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {isFullscreen ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("exit")}
            title={t("exit")}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </header>

      <div className="h-0.5 w-full bg-border">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${((clamped + 1) / total) * 100}%` }}
        />
      </div>

      {overview ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {blocks.map((block, i) => (
              <button
                key={block.id}
                type="button"
                onClick={() => {
                  setIndex(i);
                  setOverview(false);
                }}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors hover:border-primary/60",
                  i === clamped
                    ? "border-primary bg-primary/5"
                    : "border-border",
                )}
              >
                <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  {i + 1}
                </span>
                <span className="line-clamp-2 text-sm font-medium text-foreground">
                  {block.title || t("untitled_block")}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {block.language ?? block.type}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="relative flex flex-1 overflow-hidden">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={clamped === 0}
            aria-label={t("previous")}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-card/85 p-2 text-muted-foreground shadow-lg backdrop-blur-md transition-colors hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="size-5" />
          </button>

          <div className="flex-1 overflow-y-auto px-6 py-10 md:px-16">
            <div className="mx-auto w-full max-w-3xl">
              {currentBlock && (
                <BlockContent
                  key={currentBlock.id}
                  block={currentBlock}
                  isDragging={false}
                  pageFiles={{}}
                  pageBlocks={blocks}
                  setBlocks={() => {}}
                  updateBlock={updateBlock}
                  updateBlockMetadata={updateBlockMetadata}
                  updateDrawingScene={updateDrawingScene}
                  doc={doc}
                  notebookId={notebookId}
                  canEditContent={false}
                  canExecute={perms.canExecute}
                />
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => go(1)}
            disabled={clamped === total - 1}
            aria-label={t("next")}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-card/85 p-2 text-muted-foreground shadow-lg backdrop-blur-md transition-colors hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}

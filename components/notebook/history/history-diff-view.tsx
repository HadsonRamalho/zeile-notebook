"use client";

import diff from "fast-diff";
import { X } from "lucide-react";
import type { Block, Notebook } from "@/lib/types";
import { cn } from "@/lib/utils";

interface HistoryDiffViewProps {
  fromDoc: Notebook;
  toDoc: Notebook;
  onClose: () => void;
}

type BlockDiffStatus = "added" | "removed" | "modified" | "unchanged";

interface BlockDiffEntry {
  id: string;
  status: BlockDiffStatus;
  title: string;
  block: Block;
  previousBlock: Block | null;
  textDiffable: boolean;
}

const DIFFABLE_TYPES = new Set(["text", "code", "component", "latex"]);

function buildBlockDiff(fromDoc: Notebook, toDoc: Notebook): BlockDiffEntry[] {
  const fromBlocks = fromDoc.blocks ?? [];
  const toBlocks = toDoc.blocks ?? [];
  const fromById = new Map(fromBlocks.map((b) => [b.id, b]));
  const toById = new Map(toBlocks.map((b) => [b.id, b]));

  const entries: BlockDiffEntry[] = [];

  for (const block of toBlocks) {
    const previousBlock = fromById.get(block.id) ?? null;
    const textDiffable = DIFFABLE_TYPES.has(block.type);
    let status: BlockDiffStatus = "unchanged";
    if (!previousBlock) {
      status = "added";
    } else if (previousBlock.content !== block.content) {
      status = "modified";
    }
    entries.push({
      id: block.id,
      status,
      title: block.title || "Sem título",
      block,
      previousBlock,
      textDiffable,
    });
  }

  for (const block of fromBlocks) {
    if (!toById.has(block.id)) {
      entries.push({
        id: block.id,
        status: "removed",
        title: block.title || "Sem título",
        block,
        previousBlock: null,
        textDiffable: DIFFABLE_TYPES.has(block.type),
      });
    }
  }

  return entries;
}

const statusLabel: Record<BlockDiffStatus, string> = {
  added: "Adicionado",
  removed: "Removido",
  modified: "Modificado",
  unchanged: "Sem alterações",
};

const statusClass: Record<BlockDiffStatus, string> = {
  added: "bg-primary/10 text-primary border-primary/30",
  removed: "bg-destructive/10 text-destructive border-destructive/30",
  modified: "bg-accent-violet/10 text-accent-violet border-accent-violet/30",
  unchanged: "bg-muted text-muted-foreground border-border",
};

function TextDiff({ before, after }: { before: string; after: string }) {
  const parts = diff(before, after);
  return (
    <pre className="whitespace-pre-wrap break-words rounded-md bg-background p-3 font-mono text-xs leading-relaxed">
      {parts.map(([type, text], index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: diff parts have no stable identity
          key={index}
          className={cn(
            type === 1 &&
              "bg-primary/20 text-primary-foreground [&]:text-foreground",
            type === -1 &&
              "bg-destructive/20 text-destructive-foreground [&]:text-foreground line-through",
          )}
        >
          {text}
        </span>
      ))}
    </pre>
  );
}

export function HistoryDiffView({
  fromDoc,
  toDoc,
  onClose,
}: HistoryDiffViewProps) {
  const entries = buildBlockDiff(fromDoc, toDoc).filter(
    (entry) => entry.status !== "unchanged",
  );

  return (
    <div className="fixed inset-0 z-overlay flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold tracking-tight">
            Diff entre versões
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar diff"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {entries.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              Nenhuma diferença entre essas versões.
            </p>
          )}

          {entries.map((entry) => (
            <div
              key={entry.id}
              className="overflow-hidden rounded-lg border border-border"
            >
              <div className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-2">
                <span className="truncate text-sm font-medium">
                  {entry.title}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    statusClass[entry.status],
                  )}
                >
                  {statusLabel[entry.status]}
                </span>
              </div>
              {entry.status === "modified" && entry.textDiffable && (
                <TextDiff
                  before={entry.previousBlock?.content ?? ""}
                  after={entry.block.content}
                />
              )}
              {entry.status === "modified" && !entry.textDiffable && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Conteúdo não-textual modificado — sem prévia de diff.
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";

import {
  ArrowUpRight,
  FileText,
  Link2,
  Loader2,
  Replace,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getCurrentNotebook,
  getMyNotebooks,
  getNotebookMeta,
} from "@/lib/api/notebook-service";
import { fetchTeamPages } from "@/lib/api/teams-service";
import { cn } from "@/lib/utils";
import type { Block, BlockMetadata } from "@/types/block-types";
import type { Notebook } from "@/types/notebook-types";

function readRefId(block: Block): string | undefined {
  const meta = block.metadata;
  if (meta && meta.type === "notebook_ref") return meta.props.notebookId;
  return undefined;
}

async function loadScopedNotebooks(
  currentNotebookId?: string,
): Promise<Notebook[]> {
  if (currentNotebookId) {
    const metaResult = await getNotebookMeta(currentNotebookId);
    if (metaResult.isOk() && metaResult.data.teamId) {
      const result = await fetchTeamPages(metaResult.data.teamId);
      return result.isOk() ? result.data : [];
    }
  }
  const result = await getMyNotebooks();
  return result.isOk() ? result.data : [];
}

function NotebookPicker({
  currentNotebookId,
  onPick,
  children,
}: {
  currentNotebookId?: string | undefined;
  onPick: (id: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [notebooks, setNotebooks] = useState<Notebook[] | null>(null);
  const [query, setQuery] = useState("");

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && notebooks === null) {
      loadScopedNotebooks(currentNotebookId)
        .then((n) => setNotebooks(n ?? []))
        .catch(() => setNotebooks([]));
    }
  };

  const filtered = useMemo(() => {
    const list = (notebooks ?? []).filter((n) => n.id !== currentNotebookId);
    const q = query.trim().toLowerCase();
    return q ? list.filter((n) => n.title.toLowerCase().includes(q)) : list;
  }, [notebooks, query, currentNotebookId]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <div className="relative mb-2">
          <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 size-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar notebook..."
            // biome-ignore lint/a11y/noAutofocus: foco imediato ao abrir o seletor
            autoFocus
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {notebooks === null ? (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              {query.trim()
                ? "Nenhum notebook."
                : "Nenhum notebook disponível."}
            </p>
          ) : (
            filtered.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => {
                  onPick(n.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{n.title || "Sem título"}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function NotebookReferenceBlock({
  block,
  notebookId,
  canWrite,
  updateBlockMetadata,
}: {
  block: Block;
  notebookId?: string | undefined;
  canWrite: boolean;
  updateBlockMetadata: (id: string, metadata: BlockMetadata) => void;
}) {
  const refId = readRefId(block);
  const [target, setTarget] = useState<Notebook | null | "error">(null);
  const lastFetched = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!refId) {
      setTarget(null);
      lastFetched.current = undefined;
      return;
    }
    if (lastFetched.current === refId) return;
    lastFetched.current = refId;
    setTarget(null);
    let active = true;
    getCurrentNotebook(refId).then(
      (result) => active && setTarget(result.isOk() ? result.data : "error"),
    );
    return () => {
      active = false;
    };
  }, [refId]);

  const pick = (id: string) =>
    updateBlockMetadata(block.id, {
      type: "notebook_ref",
      props: { notebookId: id },
    });

  if (!refId) {
    if (!canWrite) {
      return (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          <Link2 className="size-4" /> Referência não definida
        </div>
      );
    }
    return (
      <NotebookPicker currentNotebookId={notebookId} onPick={pick}>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
        >
          <Link2 className="size-4" /> Referenciar um notebook...
        </button>
      </NotebookPicker>
    );
  }

  return (
    <div className="group/ref flex items-center gap-1">
      <Link
        href={`/notebook/${refId}`}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/50 hover:bg-primary/5",
        )}
      >
        <FileText className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate font-medium">
          {target === null ? (
            <span className="inline-block h-4 w-40 animate-pulse rounded bg-muted align-middle" />
          ) : target === "error" ? (
            <span className="text-muted-foreground">Notebook indisponível</span>
          ) : (
            target.title || "Sem título"
          )}
        </span>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/ref:text-primary" />
      </Link>
      {canWrite && (
        <NotebookPicker currentNotebookId={notebookId} onPick={pick}>
          <button
            type="button"
            aria-label="Trocar referência"
            title="Trocar referência"
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/ref:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <Replace className="size-4" />
          </button>
        </NotebookPicker>
      )}
    </div>
  );
}

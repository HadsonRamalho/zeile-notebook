"use client";

import {
  FileCode,
  Globe,
  Layers,
  Loader2,
  Replace,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getTemplate,
  listMyTemplates,
  listPublicTemplates,
  type Template,
} from "@/lib/api/template-service";
import type { Block, BlockMetadata } from "@/lib/types";
import { registerTypstSources } from "@/lib/typstStore";

type PickerEntry = {
  id: string;
  name: string;
  ownerLabel: string;
  isPublic: boolean;
};

function readRef(block: Block): { templateId?: string; version?: number } {
  const meta = block.metadata;
  if (meta && meta.type === "template_ref") return meta.props;
  return {};
}

async function loadPickerEntries(): Promise<PickerEntry[]> {
  const [mine, published] = await Promise.all([
    listMyTemplates().catch(() => [] as Template[]),
    listPublicTemplates("typst").catch(() => []),
  ]);

  const byId = new Map<string, PickerEntry>();
  for (const t of mine) {
    if (t.kind !== "typst") continue;
    byId.set(t.id, {
      id: t.id,
      name: t.name,
      ownerLabel: t.teamId ? "Time" : "Meu",
      isPublic: t.isPublic,
    });
  }
  for (const t of published) {
    if (byId.has(t.id)) continue;
    byId.set(t.id, {
      id: t.id,
      name: t.name,
      ownerLabel: t.ownerName,
      isPublic: true,
    });
  }
  return [...byId.values()];
}

function TemplatePicker({
  onPick,
  children,
}: {
  onPick: (id: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<PickerEntry[] | null>(null);
  const [query, setQuery] = useState("");

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && entries === null) {
      loadPickerEntries()
        .then(setEntries)
        .catch(() => setEntries([]));
    }
  };

  const filtered = useMemo(() => {
    const list = entries ?? [];
    const q = query.trim().toLowerCase();
    return q ? list.filter((e) => e.name.toLowerCase().includes(q)) : list;
  }, [entries, query]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <div className="relative mb-2">
          <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 size-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar template..."
            // biome-ignore lint/a11y/noAutofocus: foco imediato ao abrir o seletor
            autoFocus
            className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {entries === null ? (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">
              {query.trim()
                ? "Nenhum template."
                : "Nenhum template disponível."}
            </p>
          ) : (
            filtered.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  onPick(e.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
              >
                {e.isPublic ? (
                  <Globe className="size-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Layers className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{e.name || "Sem nome"}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {e.ownerLabel}
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

type Resolution =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty"; name: string }
  | { status: "ready"; name: string; version: number; paths: string[] };

export function TemplateReferenceBlock({
  block,
  canWrite,
  updateBlockMetadata,
}: {
  block: Block;
  canWrite: boolean;
  updateBlockMetadata: (id: string, metadata: BlockMetadata) => void;
}) {
  const { templateId, version } = readRef(block);
  const [resolution, setResolution] = useState<Resolution>({ status: "idle" });
  const lastResolved = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!templateId) {
      setResolution({ status: "idle" });
      lastResolved.current = undefined;
      return;
    }
    const key = `${templateId}@${version ?? "latest"}`;
    if (lastResolved.current === key) return;
    lastResolved.current = key;

    let active = true;
    setResolution({ status: "loading" });
    getTemplate(templateId, version)
      .then(async (resolved) => {
        if (!active) return;
        if (!resolved.version) {
          setResolution({ status: "empty", name: resolved.name });
          return;
        }
        const paths = await registerTypstSources(
          resolved.id,
          resolved.version.namedSources,
        );
        if (!active) return;
        setResolution({
          status: "ready",
          name: resolved.name,
          version: resolved.version.version,
          paths,
        });
      })
      .catch((err) => {
        if (!active) return;
        setResolution({
          status: "error",
          message: err instanceof Error ? err.message : "Template indisponível",
        });
      });
    return () => {
      active = false;
    };
  }, [templateId, version]);

  const pick = (id: string) =>
    updateBlockMetadata(block.id, {
      type: "template_ref",
      props: { templateId: id },
    });

  if (!templateId) {
    if (!canWrite) {
      return (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          <FileCode className="size-4" /> Template não definido
        </div>
      );
    }
    return (
      <TemplatePicker onPick={pick}>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
        >
          <FileCode className="size-4" /> Usar um template Typst...
        </button>
      </TemplatePicker>
    );
  }

  return (
    <div className="group/tpl flex items-start gap-1">
      <div className="min-w-0 flex-1 rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2.5">
          <FileCode className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate font-medium">
            {resolution.status === "loading" || resolution.status === "idle" ? (
              <span className="inline-block h-4 w-40 animate-pulse rounded bg-muted align-middle" />
            ) : resolution.status === "error" ? (
              <span className="text-muted-foreground">
                {resolution.message}
              </span>
            ) : (
              resolution.name
            )}
          </span>
          {resolution.status === "ready" && (
            <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-primary text-xs">
              v{resolution.version}
            </span>
          )}
        </div>
        {resolution.status === "empty" && (
          <p className="mt-2 text-sm text-muted-foreground">
            Este template ainda não tem uma versão publicada.
          </p>
        )}
        {resolution.status === "ready" && resolution.paths.length > 0 && (
          <div className="mt-2 space-y-1">
            <p className="text-muted-foreground text-xs">
              Importe em um bloco Typst:
            </p>
            {resolution.paths.map((path) => (
              <code
                key={path}
                className="block truncate rounded bg-muted px-2 py-1 font-mono text-xs"
              >
                {`#import "${path}": *`}
              </code>
            ))}
          </div>
        )}
      </div>
      {canWrite && (
        <TemplatePicker onPick={pick}>
          <button
            type="button"
            aria-label="Trocar template"
            title="Trocar template"
            className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/tpl:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <Replace className="size-4" />
          </button>
        </TemplatePicker>
      )}
    </div>
  );
}

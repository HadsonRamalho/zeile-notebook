"use client";

import { Check, Globe, Layers, Loader2, Lock, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  createTemplate,
  getTemplate,
  listMyTemplates,
  publishTemplateVersion,
  setTemplateVisibility,
  type Template,
} from "@/lib/api/template-service";
import type { Block, BlockMetadata } from "@/types/block-types";

function readMark(block: Block): { templateId: string; name: string } | null {
  const meta = block.metadata;
  if (meta && meta.type === "typst_template") return meta.props;
  return null;
}

function collectSources(
  pageBlocks: Block[],
  templateId: string,
): Record<string, string> {
  const marked = pageBlocks.filter(
    (b) =>
      b.type === "typst" &&
      b.metadata?.type === "typst_template" &&
      b.metadata.props.templateId === templateId,
  );
  const sources: Record<string, string> = {};
  const used = new Set<string>();
  marked.forEach((b, i) => {
    const base = b.title?.trim() || `bloco-${i + 1}`;
    let name = base;
    let n = 2;
    while (used.has(name)) {
      name = `${base}-${n}`;
      n += 1;
    }
    used.add(name);
    sources[name] = b.content;
  });
  return sources;
}

type Details = {
  status: "loading" | "ready" | "error";
  latestVersion?: number;
  isPublic?: boolean;
  message?: string;
};

export function TypstTemplateControls({
  block,
  notebookId,
  pageBlocks,
  updateBlockMetadata,
}: {
  block: Block;
  notebookId?: string | undefined;
  pageBlocks: Block[];
  updateBlockMetadata: (id: string, metadata: BlockMetadata) => void;
}) {
  const mark = readMark(block);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [mine, setMine] = useState<Template[] | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const markedCount = useMemo(() => {
    if (!mark) return 0;
    return Object.keys(collectSources(pageBlocks, mark.templateId)).length;
  }, [pageBlocks, mark]);

  const loadDetails = (templateId: string) => {
    setDetails({ status: "loading" });
    getTemplate(templateId)
      .then((t) =>
        setDetails({
          status: "ready",
          latestVersion: t.latestVersion,
          isPublic: t.isPublic,
        }),
      )
      .catch((err) =>
        setDetails({
          status: "error",
          message: err instanceof Error ? err.message : "Template indisponível",
        }),
      );
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    setFlash(null);
    if (!next) return;
    if (mark) {
      loadDetails(mark.templateId);
    } else if (mine === null) {
      listMyTemplates()
        .then((t) => setMine(t.filter((x) => x.kind === "typst")))
        .catch(() => setMine([]));
    }
  };

  const linkTo = (templateId: string, templateName: string) => {
    updateBlockMetadata(block.id, {
      type: "typst_template",
      props: { templateId, name: templateName },
    });
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const created = await createTemplate({
        kind: "typst",
        name: trimmed,
        sourceNotebookId: notebookId,
      });
      linkTo(created.id, created.name);
      setName("");
    } catch (err) {
      setFlash(err instanceof Error ? err.message : "Erro ao criar template");
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async () => {
    if (!mark || busy) return;
    const sources = collectSources(pageBlocks, mark.templateId);
    if (Object.keys(sources).length === 0) return;
    setBusy(true);
    try {
      const version = await publishTemplateVersion(mark.templateId, sources);
      setFlash(`Versão v${version.version} publicada`);
      loadDetails(mark.templateId);
    } catch (err) {
      setFlash(err instanceof Error ? err.message : "Erro ao publicar");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleVisibility = async () => {
    if (!mark || busy || details?.status !== "ready") return;
    setBusy(true);
    try {
      const updated = await setTemplateVisibility(
        mark.templateId,
        !details.isPublic,
      );
      setDetails((d) => (d ? { ...d, isPublic: updated.isPublic } : d));
    } catch (err) {
      setFlash(err instanceof Error ? err.message : "Erro ao alterar acesso");
    } finally {
      setBusy(false);
    }
  };

  const unlink = () => {
    updateBlockMetadata(block.id, { type: "generic" });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={mark ? `Template: ${mark.name}` : "Adicionar a um template"}
          className={
            "flex items-center gap-1 rounded-md border border-border bg-card/85 px-2 py-1.5 text-xs shadow-lg backdrop-blur transition-colors hover:bg-accent hover:text-accent-foreground " +
            (mark ? "text-primary" : "text-muted-foreground")
          }
        >
          <Layers size={14} />
          Template
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        {!mark ? (
          <div className="space-y-3">
            <div>
              <p className="mb-1 font-medium text-sm">Novo template</p>
              <div className="flex gap-1.5">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="Nome do template"
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={busy || !name.trim()}
                  className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                  aria-label="Criar template"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                </button>
              </div>
            </div>
            {mine && mine.length > 0 && (
              <div>
                <p className="mb-1 text-muted-foreground text-xs">
                  Ou vincular a um existente
                </p>
                <div className="max-h-40 space-y-0.5 overflow-y-auto">
                  {mine.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => linkTo(t.id, t.name)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <Layers className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{t.name || "Sem nome"}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {flash && <p className="text-destructive text-xs">{flash}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="font-medium text-sm">{mark.name}</p>
              <p className="text-muted-foreground text-xs">
                {markedCount} bloco{markedCount === 1 ? "" : "s"} neste template
                {details?.status === "ready" &&
                  (details.latestVersion
                    ? ` · v${details.latestVersion} publicada`
                    : " · sem versão publicada")}
              </p>
            </div>
            <button
              type="button"
              onClick={handlePublish}
              disabled={busy || markedCount === 0}
              className="flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-2 py-1.5 text-primary-foreground text-sm disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UploadCloud className="size-4" />
              )}
              Publicar versão
            </button>
            <button
              type="button"
              onClick={handleToggleVisibility}
              disabled={busy || details?.status !== "ready"}
              className="flex w-full items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm transition-colors hover:bg-accent disabled:opacity-50"
            >
              {details?.isPublic ? (
                <Globe className="size-4 text-primary" />
              ) : (
                <Lock className="size-4 text-muted-foreground" />
              )}
              {details?.isPublic ? "Público" : "Privado"}
            </button>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={unlink}
                className="text-muted-foreground text-xs hover:text-destructive"
              >
                Desvincular
              </button>
              {flash && <p className="text-primary text-xs">{flash}</p>}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

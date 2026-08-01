"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { CapabilitiesController } from "@/hooks/use-capabilities";
import { getPublicNotebookBySlug } from "@/lib/api/notebook-service";
import type { Block, Notebook } from "@/lib/types";
import { BlockContent } from "../blocks/block-content";
import { CapabilitiesProvider } from "../permissions/capabilities";

const viewOnlyCapabilities: CapabilitiesController = {
  can: (key) => key === "notebook.view" || key.endsWith(".view"),
  snapshot: null,
  ready: true,
  refetch: async () => {},
};

interface PublicNotebookViewProps {
  slug: string;
}

export function PublicNotebookView({ slug }: PublicNotebookViewProps) {
  const [doc, setDoc] = useState<Notebook | null>(null);
  const [title, setTitle] = useState("");
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getPublicNotebookBySlug(slug);
        if (cancelled || !data) {
          if (!cancelled) setStatus("error");
          return;
        }
        setTitle(data.title);
        setOwnerName(data.ownerName);
        if (data.documentData && data.documentData.length > 0) {
          const automerge = await import("@automerge/automerge");
          const loaded = automerge.load<Notebook>(
            new Uint8Array(data.documentData),
          );
          if (!cancelled) setDoc(loaded);
        }
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-muted-foreground">
        <h1 className="text-lg font-semibold text-foreground">
          Caderno não encontrado
        </h1>
        <p className="text-sm">Este caderno não é público ou não existe.</p>
      </div>
    );
  }

  const blocks: Block[] = doc?.blocks
    ? (JSON.parse(JSON.stringify(doc.blocks)) as Block[])
    : [];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-6 py-12">
      <header className="mb-8 flex flex-col gap-2 border-b border-border pb-6">
        <h1 className="text-2xl font-bold text-foreground">
          {title || "Sem título"}
        </h1>
        {ownerName && (
          <span className="text-sm text-muted-foreground">por {ownerName}</span>
        )}
      </header>

      {status === "loading" && (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      )}

      <CapabilitiesProvider value={viewOnlyCapabilities}>
        <div className="flex flex-col gap-6">
          {blocks.map((block) => (
            <BlockContent
              key={block.id}
              block={block}
              isDragging={false}
              pageFiles={{}}
              pageBlocks={blocks}
              setBlocks={() => {}}
              updateBlock={() => {}}
              updateBlockMetadata={() => {}}
              updateDrawingScene={() => {}}
              doc={doc}
              notebookId={doc?.id}
              canEditContent={false}
              canExecute={false}
            />
          ))}
        </div>
      </CapabilitiesProvider>

      <footer className="mt-12 border-t border-border pt-6 text-center">
        <Link
          href="/"
          className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-primary"
        >
          Feito no Zeile Notebook
        </Link>
      </footer>
    </div>
  );
}

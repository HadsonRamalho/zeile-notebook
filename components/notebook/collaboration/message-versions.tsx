"use client";

import { History } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ChatMessageVersionDTO } from "@/lib/api/chat-service";

interface MessageVersionsProps {
  load: () => Promise<ChatMessageVersionDTO[] | undefined>;
  /** Gatilho customizado; se ausente, usa um botão de ícone discreto. */
  trigger?: ReactNode;
}

export function MessageVersions({ load, trigger }: MessageVersionsProps) {
  const [versions, setVersions] = useState<ChatMessageVersionDTO[] | null>(null);
  const [loading, setLoading] = useState(false);

  const handleOpenChange = (open: boolean) => {
    if (open && versions === null && !loading) {
      setLoading(true);
      load()
        .then((v) => setVersions(v ?? []))
        .catch(() => setVersions([]))
        .finally(() => setLoading(false));
    }
  };

  return (
    <Popover onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            aria-label="Ver histórico de edições"
            className="inline-flex size-4 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground"
          >
            <History className="size-3" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="z-[210] max-h-72 w-72 overflow-y-auto border-border/70 bg-popover/80 p-2.5 backdrop-blur-xl"
      >
        <p className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          <History className="size-3" />
          Versões anteriores
        </p>
        {loading ? (
          <div className="space-y-1.5" aria-hidden>
            <div className="h-9 animate-pulse rounded-md bg-muted/60" />
            <div className="h-9 animate-pulse rounded-md bg-muted/40" />
          </div>
        ) : versions && versions.length > 0 ? (
          <ol className="space-y-1.5">
            {versions.map((v, i) => (
              <li
                key={v.id}
                className="rounded-md border border-border/60 bg-muted/30 p-2"
              >
                <div className="mb-0.5 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  <span>v{i + 1}</span>
                  <span>{new Date(v.createdAt).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">
                  {v.content}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            Sem versões anteriores.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

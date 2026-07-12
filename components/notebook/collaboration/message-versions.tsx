"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ChatMessageVersionDTO } from "@/lib/api/chat-service";
import { cn } from "@/lib/utils";

interface MessageVersionsProps {
  load: () => Promise<ChatMessageVersionDTO[] | undefined>;
  triggerClassName?: string;
}

export function MessageVersions({ load, triggerClassName }: MessageVersionsProps) {
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
        <button type="button" className={cn(triggerClassName)}>
          histórico
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="z-[210] max-h-64 w-72 overflow-y-auto text-foreground"
      >
        <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Versões anteriores
        </p>
        {loading ? (
          <p className="text-xs text-muted-foreground">Carregando...</p>
        ) : versions && versions.length > 0 ? (
          <ul className="space-y-2">
            {versions.map((v) => (
              <li
                key={v.id}
                className="rounded-md border border-border bg-muted/30 p-2"
              >
                <p className="whitespace-pre-wrap break-words text-sm">
                  {v.content}
                </p>
                <span className="mt-1 block font-mono text-[10px] text-muted-foreground">
                  {new Date(v.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            Sem versões anteriores.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

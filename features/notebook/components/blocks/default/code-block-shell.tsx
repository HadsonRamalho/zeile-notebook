"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

interface CodeBlockShellProps {
  header: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function CodeBlockShell({
  header,
  actions,
  children,
}: CodeBlockShellProps) {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-border bg-card shadow-2xl overflow-hidden transition-all duration-300",
        fullscreen && "fixed inset-0 z-fullscreen rounded-none",
      )}
    >
      <div className="flex items-center justify-between gap-2 bg-card px-4 py-2 border-b border-border">
        {header}
        <div className="flex items-center gap-2">
          {actions}
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            className="rounded-md border border-border bg-card/85 p-1.5 text-foreground/70 shadow-sm hover:bg-foreground/[0.06] hover:text-foreground"
            title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
            aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      <div
        className={cn(
          "flex flex-col",
          fullscreen && "flex-1 min-h-0 overflow-auto",
        )}
      >
        {children}
      </div>
    </div>
  );
}

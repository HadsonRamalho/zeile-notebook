"use client";

import { Maximize2, Minimize2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { BlockEditor } from "../block-editor";

export const defaultMermaidContent =
  "graph TD\n  A[Início] --> B{Decisão}\n  B -->|Sim| C[Fim]\n  B -->|Não| A";

interface MermaidCellProps {
  content: string;
  onChange: (content: string) => void;
  canWrite: boolean;
}

export function MermaidCell({ content, onChange, canWrite }: MermaidCellProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();
  const previewRef = useRef<HTMLDivElement>(null);
  const rawId = useId();
  const renderId = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    let cancelled = false;
    const code = content.trim();

    if (!code) {
      setError(null);
      if (previewRef.current) previewRef.current.innerHTML = "";
      return;
    }

    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: resolvedTheme === "dark" ? "dark" : "default",
          themeVariables: { primaryColor: "#169e69" },
        });
        const { svg } = await mermaid.render(renderId, code);
        if (cancelled) return;
        setError(null);
        if (previewRef.current) previewRef.current.innerHTML = svg;
      } catch (err) {
        if (cancelled) return;
        if (previewRef.current) previewRef.current.innerHTML = "";
        setError(
          err instanceof Error ? err.message : "Erro ao renderizar Mermaid",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [content, resolvedTheme, renderId]);

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg border bg-card",
        fullscreen && "fixed inset-0 z-overlay overflow-auto",
      )}
    >
      <button
        type="button"
        onClick={() => setFullscreen((v) => !v)}
        className={cn(
          "print:hidden absolute right-2 top-2 rounded-md border border-border bg-card/85 p-1.5 text-foreground/70 shadow-lg backdrop-blur hover:bg-foreground/[0.06] hover:text-foreground",
          fullscreen ? "z-overlay-controls" : "z-10",
        )}
        title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
        aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
      >
        {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>
      <div className="grid grid-cols-1 gap-3 p-3 pt-10 lg:grid-cols-2 lg:pt-3">
        <BlockEditor
          content={content}
          type="text"
          onBlur={() => {}}
          onChange={onChange}
          readOnly={!canWrite}
          minHeight="120px"
          className="bg-muted"
        />
        <div className="min-h-[120px] overflow-auto rounded-md border border-border bg-background p-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div
            ref={previewRef}
            className={cn(
              "flex justify-center [&_svg]:max-w-full",
              error && "hidden",
            )}
          />
          {!error && !content.trim() && (
            <p className="text-sm text-muted-foreground">
              Digite um diagrama Mermaid para ver a prévia.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

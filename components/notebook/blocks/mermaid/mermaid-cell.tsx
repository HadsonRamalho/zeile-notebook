"use client";

import { Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { makeMermaidInteractive } from "@/lib/mermaid-interactive";
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
  const cleanupRef = useRef<(() => void) | null>(null);
  const genRef = useRef(0);
  const rawId = useId();

  const renderDiagram = useCallback(async () => {
    const gen = ++genRef.current;
    const code = content.trim();

    cleanupRef.current?.();
    cleanupRef.current = null;

    if (!code) {
      setError(null);
      if (previewRef.current) previewRef.current.innerHTML = "";
      return;
    }

    try {
      const mermaid = (await import("mermaid")).default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: resolvedTheme === "dark" ? "dark" : "default",
        themeVariables: { primaryColor: "#169e69" },
      });
      const renderId = `mermaid-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
      const { svg } = await mermaid.render(renderId, code);
      if (gen !== genRef.current || !previewRef.current) return;
      setError(null);
      previewRef.current.innerHTML = svg;
      const svgEl = previewRef.current.querySelector("svg");
      if (svgEl instanceof SVGSVGElement) {
        svgEl.style.maxWidth = "none";
        svgEl.style.width = "100%";
        svgEl.style.height = "100%";
        cleanupRef.current = makeMermaidInteractive(svgEl);
      }
    } catch (err) {
      if (gen !== genRef.current) return;
      if (previewRef.current) previewRef.current.innerHTML = "";
      setError(
        err instanceof Error ? err.message : "Erro ao renderizar Mermaid",
      );
    }
  }, [content, resolvedTheme, rawId]);

  useEffect(() => {
    renderDiagram();
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [renderDiagram]);

  return (
    <div
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-lg border bg-card",
        fullscreen && "fixed inset-0 z-overlay",
      )}
    >
      <div
        className={cn(
          "absolute right-2 top-2 flex gap-1.5",
          fullscreen ? "z-overlay-controls" : "z-10",
        )}
      >
        <button
          type="button"
          onClick={() => renderDiagram()}
          className="rounded-md border border-border bg-card/85 p-1.5 text-foreground/70 shadow-lg backdrop-blur hover:bg-foreground/[0.06] hover:text-foreground"
          title="Redefinir visualização"
          aria-label="Redefinir visualização"
        >
          <RotateCcw size={16} />
        </button>
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          className="print:hidden rounded-md border border-border bg-card/85 p-1.5 text-foreground/70 shadow-lg backdrop-blur hover:bg-foreground/[0.06] hover:text-foreground"
          title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
          aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
        >
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      <div
        className={cn(
          "grid grid-cols-1 gap-3 p-3 pt-10 lg:grid-cols-2 lg:pt-3",
          fullscreen && "min-h-0 flex-1",
        )}
      >
        <div className={cn("min-h-0 overflow-auto", fullscreen && "h-full")}>
          <BlockEditor
            content={content}
            type="text"
            onBlur={() => {}}
            onChange={onChange}
            readOnly={!canWrite}
            minHeight="120px"
            className="bg-muted"
          />
        </div>
        <div
          className={cn(
            "relative overflow-hidden rounded-md border border-border bg-background",
            fullscreen ? "h-full" : "h-80",
          )}
        >
          {error && <p className="p-4 text-sm text-destructive">{error}</p>}
          <div
            ref={previewRef}
            className={cn("h-full w-full", error && "hidden")}
          />
          {!error && !content.trim() && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Digite um diagrama Mermaid para ver a prévia.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

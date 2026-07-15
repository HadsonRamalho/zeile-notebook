"use client";

import "katex/dist/katex.min.css";
import katex from "katex";
import { Maximize2, Minimize2 } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { BlockEditor } from "../block-editor";

export const defaultLatexContent =
  "f(x) = \\int_{-\\infty}^{\\infty} \\hat{f}(\\xi)\\, e^{2 \\pi i \\xi x} \\, d\\xi";

interface LatexCellProps {
  content: string;
  onChange: (content: string) => void;
  canWrite: boolean;
}

function renderLatex(source: string): { html: string; error: string | null } {
  if (!source.trim()) return { html: "", error: null };
  try {
    const html = katex.renderToString(source, {
      throwOnError: true,
      displayMode: true,
    });
    return { html, error: null };
  } catch (err) {
    return {
      html: "",
      error: err instanceof Error ? err.message : "Erro ao renderizar LaTeX",
    };
  }
}

export function LatexCell({ content, onChange, canWrite }: LatexCellProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const { html, error } = useMemo(() => renderLatex(content), [content]);

  return (
    <div
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-lg border bg-card",
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
      <div
        className={cn(
          "grid grid-cols-1 gap-3 p-3 pt-10 lg:grid-cols-2 lg:pt-3",
          fullscreen && "min-h-0 flex-1",
        )}
      >
        <div className={cn(fullscreen && "h-full overflow-auto")}>
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
            "min-h-[120px] overflow-auto rounded-md border border-border bg-background p-4",
            fullscreen && "h-full",
          )}
        >
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : html ? (
            <div
              className="katex-preview"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: saída confiável do katex.renderToString
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Digite uma expressão LaTeX para ver a prévia.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

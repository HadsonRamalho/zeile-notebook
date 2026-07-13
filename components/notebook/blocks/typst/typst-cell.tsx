"use client";

import { Download, FileImage, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  getTypst,
  getTypstSourcesVersion,
  subscribeTypstSources,
} from "@/lib/typstStore";
import { cn } from "@/lib/utils";
import { BlockEditor } from "../block-editor";

export const defaultTypstContent =
  "= Documento Typst\n\nEste é um documento *Typst* renderizado direto no navegador.";

interface TypstCellProps {
  content: string;
  onChange: (content: string) => void;
  canWrite: boolean;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function TypstCell({ content, onChange, canWrite }: TypstCellProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [svgHtml, setSvgHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sourcesVersion, setSourcesVersion] = useState(
    getTypstSourcesVersion(),
  );

  useEffect(
    () =>
      subscribeTypstSources(() => setSourcesVersion(getTypstSourcesVersion())),
    [],
  );

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      try {
        const typst = await getTypst();
        const html = await typst.svg({ mainContent: content });
        setSvgHtml(html);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erro ao renderizar Typst",
        );
      }
    }, 400);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [content, sourcesVersion]);

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      const typst = await getTypst();
      const bytes = await typst.pdf({ mainContent: content });
      if (bytes) {
        downloadBlob(
          new Blob([bytes as BlobPart], { type: "application/pdf" }),
          "documento.pdf",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao exportar PDF");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportPng = async () => {
    setIsExportingPng(true);
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-9999px";
    document.body.appendChild(container);
    try {
      const typst = await getTypst();
      await typst.canvas(container, { mainContent: content });
      const canvas = container.querySelector("canvas");
      if (canvas) {
        await new Promise<void>((resolve) => {
          canvas.toBlob((blob) => {
            if (blob) downloadBlob(blob, "documento.png");
            resolve();
          }, "image/png");
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao exportar PNG");
    } finally {
      document.body.removeChild(container);
      setIsExportingPng(false);
    }
  };

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg border bg-card",
        fullscreen && "fixed inset-0 z-overlay overflow-auto",
      )}
    >
      <div
        className={cn(
          "print:hidden absolute right-2 top-2 flex gap-2",
          fullscreen ? "z-overlay-controls" : "z-10",
        )}
      >
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={isExportingPdf}
          className="flex items-center gap-1 rounded-md border border-border bg-card/85 px-2 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          title="Exportar como PDF"
        >
          <Download size={14} />
          PDF
        </button>
        <button
          type="button"
          onClick={handleExportPng}
          disabled={isExportingPng}
          className="flex items-center gap-1 rounded-md border border-border bg-card/85 px-2 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
          title="Exportar como PNG"
        >
          <FileImage size={14} />
          PNG
        </button>
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          className="rounded-md border border-border bg-card/85 p-1.5 text-foreground/70 shadow-lg backdrop-blur hover:bg-foreground/[0.06] hover:text-foreground"
          title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
          aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
        >
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 p-3 pt-12 lg:grid-cols-2 lg:pt-3">
        <div
          style={{
            height: 240,
            minHeight: 240,
            maxHeight: 480,
            resize: "vertical",
            overflow: "auto",
          }}
          className="print:!h-auto print:!max-h-none print:!overflow-visible"
        >
          <BlockEditor
            content={content}
            type="text"
            onBlur={() => {}}
            onChange={onChange}
            readOnly={!canWrite}
            minHeight="240px"
            className="h-full bg-muted"
          />
        </div>
        <div
          style={{
            height: 240,
            minHeight: 240,
            maxHeight: 480,
            resize: "vertical",
            overflow: "auto",
          }}
          className="print:!h-auto print:!max-h-none print:!overflow-visible rounded-md border border-border bg-white p-4"
        >
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : svgHtml ? (
            <div
              className="typst-preview [&_svg]:h-auto [&_svg]:w-full"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: saída confiável do compilador Typst
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          ) : (
            <p className="text-sm text-neutral-500">
              Digite um documento Typst para ver a prévia.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

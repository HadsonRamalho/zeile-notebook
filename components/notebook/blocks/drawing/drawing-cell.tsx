"use client";

import "@excalidraw/excalidraw/index.css";
import dynamic from "next/dynamic";
import { Maximize2, Minimize2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";
import { readSceneElements, sceneSignature } from "@/lib/drawing-scene";
import type { DrawingElement, Notebook } from "@/lib/types";
import { cn } from "@/lib/utils";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false },
);

type ExcalidrawApi = {
  getSceneElements: () => readonly DrawingElement[];
  updateScene: (scene: { elements: readonly DrawingElement[] }) => void;
};

interface DrawingCellProps {
  doc: Notebook | null;
  blockId: string;
  updateDrawingScene: (
    blockId: string,
    elements: readonly DrawingElement[],
  ) => void;
  canWrite: boolean;
}

export function DrawingCell({
  doc,
  blockId,
  updateDrawingScene,
  canWrite,
}: DrawingCellProps) {
  const { resolvedTheme } = useTheme();
  const [fullscreen, setFullscreen] = useState(false);
  const apiRef = useRef<ExcalidrawApi | null>(null);
  // Assinatura de conteúdo do último estado sincronizado (aplicado ou enviado).
  // É a única fonte de verdade para detectar eco e quebrar o loop, sem depender
  // de timing entre updateScene e onChange.
  const lastSyncedSig = useRef<string>("");
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const remote = readSceneElements(doc, blockId);
    const sig = sceneSignature(remote);
    if (sig === lastSyncedSig.current) return;
    lastSyncedSig.current = sig;
    api.updateScene({ elements: remote });
  }, [doc, blockId]);

  useEffect(() => {
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
  }, []);

  const onChange = useCallback(
    (elements: readonly DrawingElement[]) => {
      if (!canWrite) return;
      const sig = sceneSignature(elements);
      // Sem mudança real de conteúdo (ou eco do que acabamos de aplicar).
      if (sig === lastSyncedSig.current) return;
      lastSyncedSig.current = sig;
      if (commitTimer.current) clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(() => {
        updateDrawingScene(blockId, elements);
      }, 250);
    },
    [blockId, updateDrawingScene, canWrite],
  );

  const initial = readSceneElements(doc, blockId);

  return (
    <div
      style={
        fullscreen
          ? undefined
          : { height: 480, minHeight: 480, maxHeight: 960, resize: "vertical", overflow: "auto" }
      }
      className={
        fullscreen
          ? "fixed inset-0 z-[100] bg-background"
          : "relative w-full rounded-lg border"
      }
    >
      <button
        type="button"
        onClick={() => setFullscreen((v) => !v)}
        className={cn(
          "absolute right-2 top-2 rounded-md border border-border bg-card/85 p-1.5 text-foreground/70 shadow-lg backdrop-blur hover:bg-foreground/[0.06] hover:text-foreground",
          fullscreen ? "z-[101]" : "z-10",
        )}
        title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
      >
        {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>
      <Excalidraw
        // biome-ignore lint/suspicious/noExplicitAny: API do Excalidraw
        excalidrawAPI={(api: any) => {
          apiRef.current = api;
          // Estado inicial já reflete o doc: não deve gerar commit de eco.
          lastSyncedSig.current = sceneSignature(initial);
        }}
        initialData={{ elements: initial as never }}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        viewModeEnabled={!canWrite}
        // biome-ignore lint/suspicious/noExplicitAny: elementos do Excalidraw
        onChange={(els: any) => onChange(els as DrawingElement[])}
      />
    </div>
  );
}

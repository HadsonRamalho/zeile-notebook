"use client";

import {
  SandpackCodeEditor,
  SandpackConsole,
  type SandpackInternalOptions,
  SandpackLayout,
  SandpackPreview,
  SandpackProvider,
} from "@codesandbox/sandpack-react";
import { Maximize2, Minimize2 } from "lucide-react";
import Script from "next/script";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { runTsxInSandbox } from "@/lib/sandbox/tsx-sandbox";
import type { Block, TsMode } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EditorHeader } from "../default/editor-header";
import { SandpackManager } from "./sandpack-manager";

interface TsxEditorProps {
  pageFiles: Record<string, string>;
  block: Block;
  pageBlocks: Block[];
  setBlocksAction: (blocks: Block[]) => void;
  onCodeChange: (newContent: string) => void;
}

interface BabelWindow extends Window {
  Babel?: unknown;
  define?: unknown;
  require?: unknown;
}

interface RenderPreviewProps {
  id: string;
  sandboxUrl: string | null;
}

function RenderPreview({ id, sandboxUrl }: RenderPreviewProps) {
  return (
    <div
      id={`preview-${id}`}
      className="bg-background overflow-hidden relative min-h-[300px]"
    >
      {sandboxUrl ? (
        <iframe
          title="TsxPreview"
          src={sandboxUrl}
          sandbox="allow-scripts"
          className="w-full h-[500px] border-none"
        />
      ) : (
        <div className="p-4 text-muted-foreground italic flex items-center justify-center h-[300px]">
          Clique em "Executar" para renderizar...
        </div>
      )}
    </div>
  );
}

export function TsxEditor({
  pageFiles,
  block,
  pageBlocks,
  setBlocksAction,
  onCodeChange,
}: TsxEditorProps) {
  const [showPreview, setShowPreview] = useState(true);
  const [showConsole, setShowConsole] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [mode, setMode] = useState<TsMode>("simple");
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null);
  const [babelReady, setBabelReady] = useState(false);
  const { theme } = useTheme();

  const loadBabel = () => {
    if ((window as BabelWindow).Babel) {
      setBabelReady(true);
      return;
    }

    const global = window as BabelWindow;
    const amdDefine = global.define;
    const amdRequire = global.require;

    global.define = undefined;
    global.require = undefined;

    const script = document.createElement("script");
    script.src = "https://unpkg.com/@babel/standalone/babel.min.js";
    script.async = true;

    script.onload = () => {
      global.define = amdDefine;
      global.require = amdRequire;

      setBabelReady(true);
    };

    script.onerror = (e) => {
      global.define = amdDefine;
      global.require = amdRequire;
      console.error("Falha ao carregar o Babel.", e);
    };

    document.body.appendChild(script);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadBabel só precisa reagir a babelReady/mode; a função é idempotente e não muda de identidade de forma relevante
  useEffect(() => {
    if (!babelReady && mode === "simple") {
      loadBabel();
    }
  }, [babelReady, mode]);

  const editorOptions: SandpackInternalOptions = {
    initMode: "lazy",
    recompileMode: "delayed",
    recompileDelay: 1000,
  };
  const editorFiles = { ...pageFiles, "/App.tsx": block.content };

  const handleRunSimple = async () => {
    try {
      const url = await runTsxInSandbox(block, pageBlocks);
      setSandboxUrl(url);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao executar o bloco.";
      toast.error(message);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden border border-border bg-card shadow-2xl transition-all duration-300 mb-6 mt-2",
        fullscreen && "fixed inset-0 z-fullscreen rounded-none mb-0 mt-0",
      )}
    >
      <Script
        src="https://unpkg.com/@babel/standalone/babel.min.js"
        strategy="lazyOnload"
        onLoad={() => setBabelReady(true)}
      />
      <SandpackProvider
        key={mode}
        {...(theme === "dark" ? { theme: "dark" as const } : {})}
        template="react-ts"
        files={editorFiles}
        options={editorOptions}
      >
        <div className="flex items-center justify-between gap-2 bg-card px-4 py-2 border-b border-border">
          <EditorHeader
            block={block}
            pageBlocks={pageBlocks}
            setBlocksAction={setBlocksAction}
            mode={mode}
            babelReady={babelReady}
            handleRunSimple={handleRunSimple}
            setMode={setMode}
            setShowPreview={setShowPreview}
            showPreview={showPreview}
            showConsole={showConsole}
            setShowConsole={setShowConsole}
          />
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

        <div className="flex flex-col overflow-hidden bg-card">
          <SandpackLayout>
            <SandpackCodeEditor
              showTabs
              showLineNumbers
              showInlineErrors
              showRunButton={false}
              className="h-100 text-[0.9rem]"
            />
            <div
              className={`flex-1 border-l ${
                showPreview && mode === "advanced" ? "block" : "hidden"
              }`}
            >
              <SandpackPreview
                className="h-full"
                showOpenInCodeSandbox={false}
              />
            </div>

            <div
              className={`flex-1 border-l ${
                showPreview && mode === "simple" ? "block" : "hidden"
              }`}
            >
              <RenderPreview sandboxUrl={sandboxUrl} id={block.id} />
            </div>
          </SandpackLayout>

          {mode === "advanced" && showConsole && (
            <div className="border-t border-border bg-muted/30 h-36 print:hidden overflow-auto">
              <SandpackConsole
                resetOnPreviewRestart={true}
                showResetConsoleButton={true}
              />
            </div>
          )}

          <SandpackManager code={block.content} onChange={onCodeChange} />
        </div>
      </SandpackProvider>
    </div>
  );
}

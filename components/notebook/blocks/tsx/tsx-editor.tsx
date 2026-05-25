"use client";

import {
  SandpackCodeEditor,
  SandpackConsole,
  type SandpackInternalOptions,
  SandpackLayout,
  SandpackPreview,
  SandpackProvider,
} from "@codesandbox/sandpack-react";
import Script from "next/script";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { RunTsxInSandbox } from "@/lib/api";
import type { Block, TsMode } from "@/lib/types";
import { EditorHeader } from "../default/editor-header";
import { SandpackManager } from "./sandpack-manager";

interface TsxEditorProps {
  // biome-ignore lint/suspicious/noExplicitAny: <necessário para armazenar os arquivos>
  pageFiles: Record<string, any>;
  block: Block;
  pageBlocks: Block[];
  setBlocksAction: (blocks: Block[]) => void;
  updateBlockAction: (id: string, newContent: string) => void;
}

interface RenderPreviewProps {
  id: string;
  mode: TsMode;
  sandboxUrl: string | null;
}

function RenderPreview({ id, mode, sandboxUrl }: RenderPreviewProps) {
  return (
    <div id={`preview-${id}`} className="bg-white overflow-hidden relative">
      {sandboxUrl ? (
        <iframe
          title="TsxPreview"
          src={sandboxUrl}
          sandbox="allow-scripts"
          className="w-full h-full border-none"
        />
      ) : (
        <div className="p-4 text-gray-400 italic">
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
  updateBlockAction,
}: TsxEditorProps) {
  const [showPreview, setShowPreview] = useState(true);
  const [mode, setMode] = useState<TsMode>("simple");
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null);
  const [babelReady, setBabelReady] = useState(false);
  const { theme } = useTheme();

  const loadBabel = () => {
    if ((window as any).Babel) {
      setBabelReady(true);
      return;
    }

    const global = window as any;
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
      console.log("Babel carregado com sucesso (AMD restaurado).");
    };

    script.onerror = (e) => {
      global.define = amdDefine;
      global.require = amdRequire;
      console.error("Falha ao carregar o Babel.", e);
    };

    document.body.appendChild(script);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: <loadBabel não precisa estar no array de dependências>
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
    const url = await RunTsxInSandbox(block, pageBlocks);
    setSandboxUrl(url);
  };

  return (
    <div className="rounded-lg overflow-hidden border bg-card border-border">
      <Script
        src="https://unpkg.com/@babel/standalone/babel.min.js"
        strategy="lazyOnload"
        onLoad={() => setBabelReady(true)}
      />
      <SandpackProvider
        theme={theme === "dark" ? "dark" : undefined}
        template="react-ts"
        files={editorFiles}
        options={editorOptions}
      >
        <div className="flex bg-card">
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
          />
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
            {showPreview && (
              <RenderPreview
                sandboxUrl={sandboxUrl}
                id={block.id}
                mode={mode}
              />
            )}
          </SandpackLayout>

          <div className="border-t bg-card h-24 print:hidden">
            <SandpackConsole
              resetOnPreviewRestart={true}
              showResetConsoleButton={true}
              className="h-36"
            />
          </div>

          <SandpackManager
            code={block.content}
            onChange={(val) => updateBlockAction(block.id, val)}
          />
        </div>
      </SandpackProvider>
    </div>
  );
}

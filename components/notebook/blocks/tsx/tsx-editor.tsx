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
  onCodeChange: (newContent: string) => void;
}

interface RenderPreviewProps {
  id: string;
  mode: TsMode;
  sandboxUrl: string | null;
}

function RenderPreview({ id, mode, sandboxUrl }: RenderPreviewProps) {
  return (
    <div
      id={`preview-${id}`}
      className="bg-white overflow-hidden relative min-h-[300px]"
    >
      {sandboxUrl ? (
        <iframe
          title="TsxPreview"
          src={sandboxUrl}
          sandbox="allow-scripts"
          className="w-full h-[500px] border-none"
        />
      ) : (
        <div className="p-4 text-gray-400 italic flex items-center justify-center h-[300px]">
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
    showOpenInCodeSandbox: false,
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
        key={mode}
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
            showConsole={showConsole}
            setShowConsole={setShowConsole}
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
              <RenderPreview
                sandboxUrl={sandboxUrl}
                id={block.id}
                mode={mode}
              />
            </div>
          </SandpackLayout>

          {mode === "advanced" && showConsole && (
            <div className="border-t bg-card h-36 print:hidden overflow-auto">
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

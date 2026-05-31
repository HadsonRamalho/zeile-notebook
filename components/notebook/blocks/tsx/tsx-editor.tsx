"use client";

import Script from "next/script";
import { useCallback, useEffect, useState } from "react";
import { RunTsxInSandbox } from "@/lib/api";
import type { Block } from "@/lib/types";
import { BlockEditor } from "../block-editor";
import { EditorHeader } from "../default/editor-header";

interface TsxEditorProps {
  block: Block;
  pageBlocks: Block[];
  setBlocksAction: (blocks: Block[]) => void;
  onCodeChange: (newContent: string) => void;
}

interface RenderPreviewProps {
  id: string;
  sandboxUrl: string | null;
}

function RenderPreview({ id, sandboxUrl }: RenderPreviewProps) {
  return (
    <div
      id={`preview-${id}`}
      className="bg-white overflow-hidden relative border-t min-h-[300px]"
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
  block,
  pageBlocks,
  setBlocksAction,
  onCodeChange,
}: TsxEditorProps) {
  const [showPreview, setShowPreview] = useState(true);
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null);
  const [babelReady, setBabelReady] = useState(false);

  const loadBabel = useCallback(() => {
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
  }, []);

  useEffect(() => {
    if (!babelReady) {
      loadBabel();
    }
  }, [babelReady, loadBabel]);

  const handleRunSimple = async () => {
    try {
      const url = await RunTsxInSandbox(block, pageBlocks);
      setSandboxUrl(url);
    } catch (error: any) {
      console.error("Erro ao executar TSX:", error);
      alert(error.message || "Erro ao executar o código.");
    }
  };

  const handleCodeChange = useCallback(
    (val: string) => {
      onCodeChange(val);
    },
    [onCodeChange],
  );

  return (
    <div className="rounded-lg overflow-hidden border bg-card border-border shadow-sm">
      <Script
        src="https://unpkg.com/@babel/standalone/babel.min.js"
        strategy="lazyOnload"
        onLoad={() => setBabelReady(true)}
      />

      <div className="flex bg-card">
        <EditorHeader
          block={block}
          pageBlocks={pageBlocks}
          setBlocksAction={setBlocksAction}
          babelReady={babelReady}
          handleRunSimple={handleRunSimple}
          setShowPreview={setShowPreview}
          showPreview={showPreview}
          loadBabel={loadBabel}
        />
      </div>

      <div className="flex flex-col overflow-hidden bg-card">
        <BlockEditor
          content={block.content}
          language="typescript"
          type="code"
          onChange={handleCodeChange}
          onBlur={() => {}}
          minHeight="300px"
          className="border-none rounded-none"
        />

        {showPreview && <RenderPreview sandboxUrl={sandboxUrl} id={block.id} />}
      </div>
    </div>
  );
}

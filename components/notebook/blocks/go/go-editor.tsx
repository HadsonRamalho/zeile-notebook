"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useCallback, useState } from "react";
import { RunGo } from "@/lib/api/run-rust";
import type { Block, RunStatus } from "@/lib/types";
import { BlockEditor } from "../block-editor";
import { EditorHeader } from "../default/editor-header";
import { RunButton } from "../default/run-button";

interface GoNotebookProps {
  block: Block;
  onCodeChange: (newCode: string) => void;
  isDragging?: boolean;
  sessionId: string;
}

export function GoEditor({
  block,
  onCodeChange,
  sessionId,
  isDragging = false,
}: GoNotebookProps) {
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<RunStatus>("idle");

  async function handleRun() {
    await RunGo({
      setIsRunning,
      setOutput,
      setStatus,
      code: block.content,
      sessionId,
    });
  }

  const handleCodeChange = useCallback(
    (v: string) => {
      onCodeChange(v || "");
    },
    [onCodeChange],
  );

  return (
    <div
      className={`flex flex-col gap-6 w-full mb-6 mt-2 ${
        isDragging ? "pointer-events-none opacity-50" : ""
      }`}
    >
      <div className="flex flex-col rounded-xl border border-border bg-card shadow-2xl overflow-hidden transition-all duration-300">
        <div className="flex items-center justify-between bg-card px-4 py-2 border-b border-border">
          <EditorHeader
            block={block}
            pageBlocks={[]}
            setBlocksAction={() => {}}
            mode={"simple"}
            babelReady={false}
            handleRunSimple={() => {}}
            setMode={() => {}}
            setShowPreview={() => {}}
            showPreview={false}
          />
          <RunButton
            isRunning={isRunning}
            handleRun={handleRun}
            isLoading={false}
          />
        </div>

        <div className="relative group bg-card">
          <BlockEditor
            content={block.content}
            language="go"
            onChange={handleCodeChange}
            readOnly={isDragging}
            minHeight="280px"
            className="border-none rounded-none"
            onBlur={() => {}}
            type="code"
          />
        </div>

        {!isDragging && (
          <div className="border-t border-border dark:bg-[#0f0f0f] print:hidden">
            <div className="flex items-center justify-between px-4 py-2 dark:bg-[#1a1a1a] border-b border-border">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Console
              </span>
              {status !== "idle" && (
                <div
                  className={`flex items-center gap-1.5 text-[12px] font-bold uppercase ${
                    status === "success" ? "text-emerald-500" : "text-red-500"
                  }`}
                >
                  {status === "success" ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <AlertCircle size={16} />
                  )}
                  {status === "success" ? "Sucesso" : "Falha"}
                </div>
              )}
            </div>
            <div className="p-4 font-mono text-sm min-h-20 max-h-60 overflow-y-auto custom-scrollbar print:hidden">
              {output ? (
                <pre
                  className={`whitespace-pre-wrap ${
                    status === "error" ? "text-red-400" : "text-gray-300"
                  }`}
                >
                  {output}
                </pre>
              ) : (
                <span className="text-muted-foreground italic">
                  Aguardando execução...
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

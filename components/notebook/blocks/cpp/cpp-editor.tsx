"use client";

import { useCallback, useState } from "react";
import { RunCode } from "@/lib/api/run-rust";
import type { Block, RunStatus } from "@/lib/types";
import { BlockEditor } from "../block-editor";
import { EditorConsole } from "../default/editor-console";
import { EditorHeader } from "../default/editor-header";
import { RunButton } from "../default/run-button";

interface CppNotebookProps {
  block: Block;
  onCodeChange: (newCode: string) => void;
  isDragging?: boolean;
  sessionId: string;
}

export function CppEditor({
  block,
  onCodeChange,
  sessionId,
  isDragging = false,
}: CppNotebookProps) {
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<RunStatus>("idle");

  async function handleRun() {
    await RunCode({
      setIsRunning,
      setOutput,
      setStatus,
      code: block.content,
      sessionId,
      language: "cpp",
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
            language="cpp"
            onChange={handleCodeChange}
            readOnly={isDragging}
            minHeight="280px"
            className="border-none rounded-none"
            onBlur={() => {}}
            type="code"
          />
        </div>

        {!isDragging && <EditorConsole status={status} output={output} />}
      </div>
    </div>
  );
}

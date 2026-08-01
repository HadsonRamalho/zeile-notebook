"use client";

import { useCallback, useState } from "react";
import { RunCode } from "@/lib/api/run-rust";
import type { Block, RunStatus } from "@/lib/types";
import { BlockEditor } from "../block-editor";
import { CodeBlockShell } from "../default/code-block-shell";
import { EditorConsole } from "../default/editor-console";
import { EditorHeader } from "../default/editor-header";
import { RunButton } from "../default/run-button";

interface CppNotebookProps {
  block: Block;
  onCodeChange: (newCode: string) => void;
  isDragging?: boolean;
  notebookId?: string;
  canExecute?: boolean;
}

export function CppEditor({
  block,
  onCodeChange,
  notebookId,
  canExecute = true,
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
      notebookId,
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
      <CodeBlockShell
        header={
          <EditorHeader
            block={block}
            pageBlocks={[]}
            setBlocksAction={() => {}}
            babelReady={false}
            handleRunSimple={() => {}}
            setShowPreview={() => {}}
            showPreview={false}
          />
        }
        actions={
          canExecute && (
            <RunButton
              isRunning={isRunning}
              handleRun={handleRun}
              isLoading={false}
            />
          )
        }
      >
        <div className="relative group bg-card">
          <BlockEditor
            content={block.content}
            language="cpp"
            onChange={handleCodeChange}
            readOnly={isDragging}
            minHeight="280px"
            className="border-none rounded-none"
            onBlur={() => {}}
            onRun={canExecute ? handleRun : undefined}
            type="code"
          />
        </div>

        {!isDragging && <EditorConsole status={status} output={output} />}
      </CodeBlockShell>
    </div>
  );
}

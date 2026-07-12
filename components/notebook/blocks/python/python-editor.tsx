"use client";
import { useCallback, useState } from "react";
import type { Block, RunStatus } from "@/lib/types";
import { BlockEditor } from "../block-editor";
import { CodeBlockShell } from "../default/code-block-shell";
import { EditorConsole } from "../default/editor-console";
import { EditorHeader } from "../default/editor-header";
import { RunButton } from "../default/run-button";

interface PythonSandboxProps {
  block: Block;
  isDragging: boolean;
  onCodeChange: (newCode: string) => void;
}

export default function PythonSandbox({
  onCodeChange,
  isDragging,
  block,
}: PythonSandboxProps) {
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<RunStatus>("idle");

  async function handleRun() {
    setIsRunning(true);
    const { RunPythonInSandbox } = await import("../../../../lib/api");
    const res = await RunPythonInSandbox(block.content);

    if (res.error) {
      setOutput(`Erro: ${res.error}`);
      setStatus("error");
    } else {
      setOutput(res.output || res.result);
      setStatus("success");
    }
    setIsRunning(false);
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
          <RunButton
            isRunning={isRunning}
            handleRun={handleRun}
            isLoading={false}
          />
        }
      >
        <div className="relative group bg-card">
          <BlockEditor
            content={block.content}
            language="python"
            onChange={handleCodeChange}
            readOnly={isDragging}
            minHeight="280px"
            className="border-none rounded-none"
            onBlur={() => {}}
            onRun={handleRun}
            type="code"
          />
        </div>

        {!isDragging && <EditorConsole status={status} output={output} />}
      </CodeBlockShell>
    </div>
  );
}

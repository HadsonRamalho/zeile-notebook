"use client";
import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import {
  clearCellResult,
  parseInlineTable,
  publishCellResult,
} from "@/features/notebook/stores/cell-results-store";
import type { Block, RunStatus } from "@/types/block-types";
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
  const t = useTranslations("run_rust");
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<RunStatus>("idle");

  async function handleRun() {
    setIsRunning(true);
    const { runPythonInSandbox } = await import("@/lib/sandbox/python-sandbox");
    const result = await runPythonInSandbox(block.content);

    if (result.isErr()) {
      const message =
        result.error instanceof Error
          ? result.error.message
          : String(result.error);
      setOutput(t("error_prefix", { error: message }));
      setStatus("error");
      clearCellResult(block.id);
    } else {
      const text = result.data.output || result.data.result || "";
      setOutput(text);
      setStatus("success");
      const table = parseInlineTable(text);
      if (table) {
        publishCellResult(block.id, {
          columns: table.columns,
          rows: table.rows,
        });
      } else {
        clearCellResult(block.id);
      }
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

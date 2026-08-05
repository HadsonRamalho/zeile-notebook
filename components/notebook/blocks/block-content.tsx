"use client";

import { useCallback } from "react";
import { useExecutionCapabilities } from "@/hooks/use-execution-capabilities";
import type {
  Block,
  BlockMetadata,
  DrawingElement,
  Language,
  Notebook,
} from "@/lib/types";
import { useCapabilitiesContext } from "../permissions/capabilities";
import { ChallengeBlock } from "./challenge/challenge-block";
import { ChartCell } from "./chart/chart-cell";
import { ComponentRenderer } from "./components/components";
import { CppEditor } from "./cpp/cpp-editor";
import { DatabaseSchemaCell } from "./database-schema/database-schema-cell";
import { DrawingCell } from "./drawing/drawing-cell";
import { FreeDrawingCell } from "./free-drawing/free-drawing-cell";
import { GenericBlockEditor } from "./generic/generic-code-block";
import { GoEditor } from "./go/go-editor";
import { LatexCell } from "./latex/latex-cell";
import { MermaidCell } from "./mermaid/mermaid-cell";
import { NotebookReferenceBlock } from "./notebook-ref/notebook-ref-block";
import PythonSandbox from "./python/python-editor";
import { RustEditor } from "./rust/rust-editor";
import { SqlCell } from "./sql/sql-cell";
import { TemplateReferenceBlock } from "./template-ref/template-ref-block";
import { TextBlock } from "./text/text-block";
import { TsxEditor } from "./tsx/tsx-editor";
import { TypstCell } from "./typst/typst-cell";
import { ZigEditor } from "./zig/zig-editor";

const KNOWN_BLOCK_TYPES = new Set([
  "rust",
  "go",
  "python",
  "cpp",
  "zig",
  "tsx",
  "drawing",
  "text",
]);
const EXEC_LANGS = ["rust", "go", "python", "cpp", "zig", "tsx"];
const BACKEND_COMPILED_LANGS = new Set(["rust", "go", "cpp", "zig"]);

const DIRECT_PERM_TYPES = new Set([
  "latex",
  "sql",
  "typst",
  "database_schema",
  "challenge",
  "component",
  "notebook_ref",
  "template_ref",
]);

export function blockPermType(block: Block): string | null {
  if (block.type === "code") {
    const lang = block.language === "typescript" ? "tsx" : block.language;
    return lang && KNOWN_BLOCK_TYPES.has(lang) ? lang : null;
  }
  if (block.type === "text") return "text";
  if (block.type === "drawing" || block.type === "free_drawing")
    return "drawing";
  if (DIRECT_PERM_TYPES.has(block.type)) return block.type;
  return null;
}

export interface BlockPermissions {
  canView: boolean;
  canExecute: boolean;
  canEditContent: boolean;
  canReorder: boolean;
  canDelete: boolean;
}

export function useBlockPermissions(
  block: Block,
  canWrite: boolean,
): BlockPermissions {
  const { can, ready } = useCapabilitiesContext();

  const permType = blockPermType(block);
  const canView =
    !ready ||
    can(
      permType ? `notebook.blocks.${permType}.view` : "notebook.blocks.view",
      {
        blockType: permType ?? undefined,
      },
    );
  const execType = permType && EXEC_LANGS.includes(permType) ? permType : null;
  const canExecute =
    !ready ||
    !execType ||
    can(`notebook.blocks.${execType}.execute`, { blockType: execType });
  const canDelete =
    !ready ||
    can("notebook.blocks.delete", { blockType: permType ?? undefined });
  const canReorder = !ready || can("notebook.blocks.reorder");
  const canEditContent =
    canWrite &&
    (!ready ||
      can(
        permType ? `notebook.blocks.${permType}.edit` : "notebook.blocks.edit",
        { blockType: permType ?? undefined },
      ));

  return { canView, canExecute, canEditContent, canReorder, canDelete };
}

interface BlockContentProps {
  block: Block;
  isDragging: boolean;
  pageFiles: Record<string, string>;
  pageBlocks: Block[];
  setBlocks: (b: Block[]) => void;
  updateBlock: (id: string, newContent: string) => void;
  updateBlockMetadata: (id: string, newMetadata: BlockMetadata) => void;
  updateDrawingScene: (id: string, elements: readonly DrawingElement[]) => void;
  doc: Notebook | null;
  notebookId?: string;
  canEditContent: boolean;
  canExecute: boolean;
}

export function BlockContent({
  block,
  isDragging,
  pageBlocks,
  setBlocks,
  updateBlock,
  updateBlockMetadata,
  updateDrawingScene,
  doc,
  notebookId,
  canEditContent,
  canExecute,
}: BlockContentProps) {
  const handleUpdateContent = useCallback(
    (val: string) => {
      updateBlock(block.id, val);
    },
    [block.id, updateBlock],
  );

  const executionCapabilities = useExecutionCapabilities();

  const effectiveCanExecute = (language: string) =>
    BACKEND_COMPILED_LANGS.has(language)
      ? canExecute && executionCapabilities.isLanguageAvailable(language)
      : canExecute;

  const executionUnavailableReason = (language: string): string | undefined => {
    if (executionCapabilities.isLanguageAvailable(language)) return undefined;
    const missing = executionCapabilities.missingFor(language);
    return `Execução de ${language} indisponível neste servidor${
      missing.length ? ` (faltando: ${missing.join(", ")})` : ""
    }.`;
  };

  return (
    <div className="flex-1 min-w-0">
      {block.type === "challenge" ? (
        <ChallengeBlock
          block={block}
          notebookId={notebookId}
          canWrite={canEditContent}
          updateBlock={updateBlock}
          updateBlockMetadata={updateBlockMetadata}
        />
      ) : block.type === "notebook_ref" ? (
        <NotebookReferenceBlock
          block={block}
          notebookId={notebookId}
          canWrite={canEditContent}
          updateBlockMetadata={updateBlockMetadata}
        />
      ) : block.type === "template_ref" ? (
        <TemplateReferenceBlock
          block={block}
          canWrite={canEditContent}
          updateBlockMetadata={updateBlockMetadata}
        />
      ) : block.type === "chart" ? (
        <ChartCell
          block={block}
          pageBlocks={pageBlocks}
          canWrite={canEditContent}
          updateBlock={updateBlock}
          updateBlockMetadata={updateBlockMetadata}
        />
      ) : block.type === "drawing" ? (
        <DrawingCell
          doc={doc}
          blockId={block.id}
          updateDrawingScene={updateDrawingScene}
          canWrite={canEditContent}
        />
      ) : block.type === "free_drawing" ? (
        <FreeDrawingCell
          doc={doc}
          blockId={block.id}
          updateDrawingScene={updateDrawingScene}
          canWrite={canEditContent}
        />
      ) : block.type === "database_schema" ? (
        <DatabaseSchemaCell
          content={block.content}
          onChange={(val) => updateBlock(block.id, val)}
          canWrite={canEditContent}
        />
      ) : block.type === "latex" ? (
        <LatexCell
          content={block.content}
          onChange={(val) => updateBlock(block.id, val)}
          canWrite={canEditContent}
        />
      ) : block.type === "mermaid" ? (
        <MermaidCell
          content={block.content}
          onChange={(val) => updateBlock(block.id, val)}
          canWrite={canEditContent}
        />
      ) : block.type === "sql" ? (
        <SqlCell
          content={block.content}
          onChange={(val) => updateBlock(block.id, val)}
          canWrite={canEditContent}
          notebookId={doc?.id ?? "default"}
          blockId={block.id}
        />
      ) : block.type === "typst" ? (
        <TypstCell
          content={block.content}
          onChange={(val) => updateBlock(block.id, val)}
          canWrite={canEditContent}
          block={block}
          notebookId={notebookId}
          pageBlocks={pageBlocks}
          updateBlockMetadata={updateBlockMetadata}
        />
      ) : block.type === "text" ? (
        <TextBlock
          content={block.content}
          onChange={(val) => canEditContent && updateBlock(block.id, val)}
        />
      ) : block.type === "component" ? (
        <ComponentRenderer
          block={block}
          onCodeChange={canEditContent ? handleUpdateContent : () => {}}
          updateBlockMetadata={canEditContent ? updateBlockMetadata : () => {}}
        />
      ) : block.language === "typescript" ? (
        <TsxEditor
          pageFiles={{}}
          block={block}
          pageBlocks={pageBlocks}
          setBlocksAction={canEditContent ? setBlocks : () => {}}
          onCodeChange={canEditContent ? handleUpdateContent : () => {}}
        />
      ) : block.language === "python" ? (
        <PythonSandbox
          block={block}
          isDragging={isDragging}
          onCodeChange={canEditContent ? handleUpdateContent : () => {}}
        />
      ) : block.language === "go" ? (
        <GoEditor
          block={block}
          isDragging={isDragging}
          notebookId={notebookId}
          canExecute={effectiveCanExecute("go")}
          executionUnavailableReason={executionUnavailableReason("go")}
          onCodeChange={canEditContent ? handleUpdateContent : () => {}}
        />
      ) : block.language === "cpp" ? (
        <CppEditor
          block={block}
          onCodeChange={canEditContent ? handleUpdateContent : () => {}}
          notebookId={notebookId}
          canExecute={effectiveCanExecute("cpp")}
          executionUnavailableReason={executionUnavailableReason("cpp")}
        />
      ) : block.language === "zig" ? (
        <ZigEditor
          block={block}
          onCodeChange={canEditContent ? handleUpdateContent : () => {}}
          notebookId={notebookId}
          canExecute={effectiveCanExecute("zig")}
          executionUnavailableReason={executionUnavailableReason("zig")}
        />
      ) : block.language === "generic" ? (
        (() => {
          let currentProps: Record<string, unknown> = {};
          if (block.metadata?.type === "generic" && block.metadata.props) {
            currentProps = block.metadata.props;
          }

          const selectedLanguage =
            (currentProps.language as Language) || "typescript";

          return (
            <GenericBlockEditor
              content={block.content}
              type="code"
              language={selectedLanguage}
              onBlur={(): void => {}}
              onChange={canEditContent ? handleUpdateContent : () => {}}
              onLanguageChange={
                canEditContent
                  ? (newLang) => {
                      updateBlockMetadata(block.id, {
                        type: "generic",
                        props: {
                          ...currentProps,
                          language: newLang,
                        },
                      });
                    }
                  : undefined
              }
              readOnly={!canEditContent}
            />
          );
        })()
      ) : (
        <RustEditor
          block={block}
          isDragging={isDragging}
          notebookId={notebookId}
          canExecute={effectiveCanExecute("rust")}
          executionUnavailableReason={executionUnavailableReason("rust")}
          onCodeChange={canEditContent ? handleUpdateContent : () => {}}
        />
      )}
    </div>
  );
}

"use client";

import { Reorder, useDragControls } from "framer-motion";
import { GripVertical, Trash2 } from "lucide-react";
import { useCallback } from "react";
import type {
  Block,
  BlockMetadata,
  DrawingElement,
  Language,
  Notebook,
} from "@/lib/types";
import { ComponentRenderer } from "../blocks/components/components";
import { CppEditor } from "../blocks/cpp/cpp-editor";
import { DatabaseSchemaCell } from "../blocks/database-schema/database-schema-cell";
import { DrawingCell } from "../blocks/drawing/drawing-cell";
import { FreeDrawingCell } from "../blocks/free-drawing/free-drawing-cell";
import { GenericBlockEditor } from "../blocks/generic/generic-code-block";
import { GoEditor } from "../blocks/go/go-editor";
import { LatexCell } from "../blocks/latex/latex-cell";
import PythonSandbox from "../blocks/python/python-editor";
import { RustEditor } from "../blocks/rust/rust-editor";
import { SqlCell } from "../blocks/sql/sql-cell";
import { TextBlock } from "../blocks/text/text-block";
import { TsxEditor } from "../blocks/tsx/tsx-editor";
import { TypstCell } from "../blocks/typst/typst-cell";
import { ZigEditor } from "../blocks/zig/zig-editor";
import { useCapabilitiesContext } from "../permissions/capabilities";

interface ReorderItemProps {
  block: Block;
  isDragging: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: <Necessário pra gerenciar os arquivos>
  pageFiles: Record<string, any>;
  pageBlocks: Block[];
  setBlocks: (b: Block[]) => void;
  setIsDragging: (d: boolean) => void;
  removeBlock: (id: string) => void;
  updateBlock: (id: string, newContent: string) => void;
  updateBlockMetadata: (id: string, newMetadata: BlockMetadata) => void;
  updateDrawingScene: (id: string, elements: readonly DrawingElement[]) => void;
  doc: Notebook | null;
  sessionId: string;
  notebookId?: string;
  canWrite: boolean;
}

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
const EXEC_LANGS = ["rust", "go", "cpp", "zig"];

function blockPermType(block: Block): string | null {
  if (block.type === "code") {
    const lang = block.language === "typescript" ? "tsx" : block.language;
    return lang && KNOWN_BLOCK_TYPES.has(lang) ? lang : null;
  }
  if (block.type === "text") return "text";
  if (block.type === "drawing" || block.type === "free_drawing")
    return "drawing";
  return null;
}

export function ReorderItem({
  block,
  setIsDragging,
  isDragging,
  pageBlocks,
  pageFiles,
  setBlocks,
  updateBlock,
  removeBlock,
  updateBlockMetadata,
  updateDrawingScene,
  doc,
  sessionId,
  notebookId,
  canWrite,
}: ReorderItemProps) {
  const dragControls = useDragControls();
  const { can, ready } = useCapabilitiesContext();

  const handleUpdateContent = useCallback(
    (val: string) => {
      updateBlock(block.id, val);
    },
    [block.id, updateBlock],
  );

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
    can(
      permType
        ? `notebook.blocks.${permType}.delete`
        : "notebook.blocks.delete",
      { blockType: permType ?? undefined },
    );
  const canEditContent =
    canWrite &&
    (!ready ||
      can(
        permType ? `notebook.blocks.${permType}.edit` : "notebook.blocks.edit",
        { blockType: permType ?? undefined },
      ));

  if (!canView) return null;

  return (
    <Reorder.Item
      value={block}
      id={block.id}
      className="group/item flex items-start relative mb-4"
      dragControls={dragControls}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      dragListener={false}
    >
      {canWrite && (
        <div
          className="absolute -left-6 top-2 flex flex-col gap-2 transition-opacity opacity-100 md:opacity-0 group-hover/item:opacity-100 hover:cursor-grab active:cursor-grabbing select-none touch-none print:hidden"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <GripVertical
            size={16}
            className="text-muted-foreground cursor-grab active:cursor-grabbing"
          />
          {pageBlocks.length > 1 && canDelete && (
            <button
              type="button"
              disabled={pageBlocks.length === 1}
              onClick={() => removeBlock(block.id)}
              aria-label="Excluir bloco"
              title="Excluir bloco"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}

      <div className="flex-1 min-w-0">
        {block.type === "drawing" ? (
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
        ) : block.type === "sql" ? (
          <SqlCell
            content={block.content}
            onChange={(val) => updateBlock(block.id, val)}
            canWrite={canEditContent}
            notebookId={doc?.id ?? "default"}
          />
        ) : block.type === "typst" ? (
          <TypstCell
            content={block.content}
            onChange={(val) => updateBlock(block.id, val)}
            canWrite={canEditContent}
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
            updateBlockMetadata={
              canEditContent ? updateBlockMetadata : () => {}
            }
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
            sessionId={sessionId}
            notebookId={notebookId}
            canExecute={canExecute}
            onCodeChange={canEditContent ? handleUpdateContent : () => {}}
          />
        ) : block.language === "cpp" ? (
          <CppEditor
            block={block}
            onCodeChange={canEditContent ? handleUpdateContent : () => {}}
            sessionId={sessionId}
            notebookId={notebookId}
            canExecute={canExecute}
          />
        ) : block.language === "zig" ? (
          <ZigEditor
            block={block}
            onCodeChange={canEditContent ? handleUpdateContent : () => {}}
            sessionId={sessionId}
            notebookId={notebookId}
            canExecute={canExecute}
          />
        ) : block.language === "generic" ? (
          (() => {
            let currentProps: Record<string, any> = {};
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
            sessionId={sessionId}
            notebookId={notebookId}
            canExecute={canExecute}
            onCodeChange={canEditContent ? handleUpdateContent : () => {}}
          />
        )}
      </div>
    </Reorder.Item>
  );
}

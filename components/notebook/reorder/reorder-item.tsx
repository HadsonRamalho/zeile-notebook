"use client";

import { Reorder, useDragControls } from "framer-motion";
import { GripVertical, Trash2 } from "lucide-react";
import { useCallback } from "react";
import type { Block, BlockMetadata, Language } from "@/lib/types";
import { ComponentRenderer } from "../blocks/components/components";
import { CppEditor } from "../blocks/cpp/cpp-editor";
import { GenericBlockEditor } from "../blocks/generic/generic-code-block";
import { GoEditor } from "../blocks/go/go-editor";
import PythonSandbox from "../blocks/python/python-editor";
import { RustEditor } from "../blocks/rust/rust-editor";
import { TextBlock } from "../blocks/text/text-block";
import { TsxEditor } from "../blocks/tsx/tsx-editor";

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
  sessionId: string;
  canWrite: boolean;
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
  sessionId,
  canWrite,
}: ReorderItemProps) {
  const dragControls = useDragControls();

  const handleUpdateContent = useCallback(
    (val: string) => {
      updateBlock(block.id, val);
    },
    [block.id, updateBlock],
  );

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
          className="absolute -left-6 top-2 flex flex-col gap-2 transition-opacity opacity-100 md:opacity-0 group-hover/item:opacity-100 hover:cursor-grab active:cursor-grabbing select-none touch-none"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <GripVertical
            size={16}
            className="text-gray-600 cursor-grab active:cursor-grabbing"
          />
          {pageBlocks.length > 1 && (
            <button
              type="button"
              disabled={pageBlocks.length === 1}
              onClick={() => removeBlock(block.id)}
              className="text-gray-600 hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      )}

      <div className="flex-1 min-w-0">
        {block.type === "text" ? (
          <TextBlock
            content={block.content}
            onChange={(val) => canWrite && updateBlock(block.id, val)}
          />
        ) : block.type === "component" ? (
          <ComponentRenderer
            block={block}
            onCodeChange={canWrite ? handleUpdateContent : () => {}}
            updateBlockMetadata={canWrite ? updateBlockMetadata : () => {}}
          />
        ) : block.language === "typescript" ? (
          <TsxEditor
            pageFiles={{}}
            block={block}
            pageBlocks={pageBlocks}
            setBlocksAction={canWrite ? setBlocks : () => {}}
            onCodeChange={canWrite ? handleUpdateContent : () => {}}
          />
        ) : block.language === "python" ? (
          <PythonSandbox
            block={block}
            isDragging={isDragging}
            onCodeChange={canWrite ? handleUpdateContent : () => {}}
          />
        ) : block.language === "go" ? (
          <GoEditor
            block={block}
            isDragging={isDragging}
            sessionId={sessionId}
            onCodeChange={canWrite ? handleUpdateContent : () => {}}
          />
        ) : block.language === "cpp" ? (
          <CppEditor
            block={block}
            onCodeChange={canWrite ? handleUpdateContent : () => {}}
            sessionId={sessionId}
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
                onChange={canWrite ? handleUpdateContent : () => {}}
                onLanguageChange={
                  canWrite
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
                readOnly={!canWrite}
              />
            );
          })()
        ) : (
          <RustEditor
            block={block}
            isDragging={isDragging}
            sessionId={sessionId}
            onCodeChange={canWrite ? handleUpdateContent : () => {}}
          />
        )}
      </div>
    </Reorder.Item>
  );
}

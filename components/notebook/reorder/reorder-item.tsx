"use client";

import { Reorder, useDragControls } from "framer-motion";
import { GripVertical, Trash2 } from "lucide-react";
import { useCallback } from "react";
import type { Block, BlockMetadata } from "@/lib/types";
import { ComponentRenderer } from "../blocks/components/components";
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

      <div className="flex-1 min-w-0">
        {block.type === "text" ? (
          <TextBlock
            content={block.content}
            onChange={(val) => updateBlock(block.id, val)}
          />
        ) : block.type === "component" ? (
          <ComponentRenderer
            block={block}
            updateBlockAction={handleUpdateContent}
            updateBlockMetadata={updateBlockMetadata}
          />
        ) : block.language === "typescript" ? (
          <TsxEditor
            pageFiles={pageFiles}
            block={block}
            pageBlocks={pageBlocks}
            setBlocksAction={setBlocks}
            updateBlockAction={handleUpdateContent}
          />
        ) : block.language === "python" ? (
          <PythonSandbox
            onCodeChange={handleUpdateContent}
            block={block}
            isDragging={isDragging}
          />
        ) : block.language === "go" ? (
          <GoEditor
            block={block}
            isDragging={isDragging}
            onCodeChange={handleUpdateContent}
          />
        ) : (
          <RustEditor
            block={block}
            isDragging={isDragging}
            onCodeChange={handleUpdateContent}
          />
        )}
      </div>
    </Reorder.Item>
  );
}

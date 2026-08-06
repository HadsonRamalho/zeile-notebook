"use client";

import { Reorder, useDragControls } from "framer-motion";
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";
import type { Block, BlockMetadata, DrawingElement } from "@/types/block-types";
import type { Notebook } from "@/types/notebook-types";
import { BlockContent, useBlockPermissions } from "../blocks/block-content";

interface ReorderItemProps {
  block: Block;
  isDragging: boolean;
  pageFiles: Record<string, string>;
  pageBlocks: Block[];
  setBlocks: (b: Block[]) => void;
  setIsDragging: (d: boolean) => void;
  removeBlock: (id: string) => void;
  moveBlock?: (id: string, direction: -1 | 1) => void;
  updateBlock: (id: string, newContent: string) => void;
  updateBlockMetadata: (id: string, newMetadata: BlockMetadata) => void;
  updateDrawingScene: (id: string, elements: readonly DrawingElement[]) => void;
  doc: Notebook | null;
  notebookId?: string;
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
  moveBlock,
  updateBlockMetadata,
  updateDrawingScene,
  doc,
  notebookId,
  canWrite,
}: ReorderItemProps) {
  const dragControls = useDragControls();
  const { canView, canExecute, canEditContent, canReorder, canDelete } =
    useBlockPermissions(block, canWrite);

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
      {(canReorder || canDelete) && (
        <div className="absolute -left-6 top-2 flex flex-col gap-2 transition-opacity opacity-100 md:opacity-0 group-hover/item:opacity-100 select-none touch-none print:hidden">
          {canReorder && (
            <button
              type="button"
              aria-label="Reordenar bloco"
              className="cursor-grab active:cursor-grabbing text-muted-foreground"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <GripVertical size={16} />
            </button>
          )}
          {canReorder && moveBlock && pageBlocks.length > 1 && (
            <>
              <button
                type="button"
                disabled={pageBlocks[0]?.id === block.id}
                onClick={() => moveBlock(block.id, -1)}
                aria-label="Mover bloco para cima"
                title="Mover para cima"
                className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                disabled={pageBlocks[pageBlocks.length - 1]?.id === block.id}
                onClick={() => moveBlock(block.id, 1)}
                aria-label="Mover bloco para baixo"
                title="Mover para baixo"
                className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground"
              >
                <ArrowDown size={14} />
              </button>
            </>
          )}
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

      <BlockContent
        block={block}
        isDragging={isDragging}
        pageFiles={pageFiles}
        pageBlocks={pageBlocks}
        setBlocks={setBlocks}
        updateBlock={updateBlock}
        updateBlockMetadata={updateBlockMetadata}
        updateDrawingScene={updateDrawingScene}
        doc={doc}
        notebookId={notebookId}
        canEditContent={canEditContent}
        canExecute={canExecute}
      />
    </Reorder.Item>
  );
}

"use client";

import { Handle, type NodeProps, Position, useReactFlow } from "@xyflow/react";
import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  MermaidNode as MermaidNodeModel,
  MermaidShape,
} from "@/features/notebook/lib/mermaid-graph";
import { cn } from "@/lib/utils";
import { useMermaidCanEdit } from "./mermaid-context";

const SHAPES: MermaidShape[] = [
  "rect",
  "round",
  "stadium",
  "circle",
  "diamond",
];

const SHAPE_LABEL: Record<MermaidShape, string> = {
  rect: "▭",
  round: "▢",
  stadium: "⬭",
  circle: "○",
  diamond: "◇",
};

function shapeClass(shape: MermaidShape): string {
  switch (shape) {
    case "round":
      return "rounded-xl";
    case "stadium":
      return "rounded-full px-6";
    case "circle":
      return "rounded-full aspect-square";
    case "diamond":
      return "[clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)] p-6";
    default:
      return "rounded-md";
  }
}

const HANDLES: { id: string; position: Position }[] = [
  { id: "t", position: Position.Top },
  { id: "r", position: Position.Right },
  { id: "b", position: Position.Bottom },
  { id: "l", position: Position.Left },
];

export function MermaidNode({
  id,
  data,
  selected,
}: NodeProps<MermaidNodeModel>) {
  const { updateNodeData, deleteElements } = useReactFlow();
  const canEdit = useMermaidCanEdit();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const startEditing = () => {
    setDraft(data.label);
    setEditing(true);
  };

  const commitLabel = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== data.label) updateNodeData(id, { label: next });
    else setDraft(data.label);
  };

  const cycleShape = () => {
    const currentIndex = SHAPES.indexOf(data.shape);
    const next = SHAPES[(currentIndex + 1) % SHAPES.length];
    updateNodeData(id, { shape: next });
  };

  return (
    <div
      className={cn(
        "relative flex min-h-11 min-w-24 items-center justify-center border bg-card px-4 py-2 text-center text-sm text-foreground shadow-sm",
        shapeClass(data.shape),
        selected ? "border-primary" : "border-border",
      )}
    >
      {HANDLES.map((handle) => (
        <Handle
          key={handle.id}
          id={handle.id}
          type="source"
          position={handle.position}
          className="!size-2 !border !border-background !bg-primary"
        />
      ))}

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitLabel();
            if (e.key === "Escape") {
              setDraft(data.label);
              setEditing(false);
            }
          }}
          className="nodrag w-24 bg-transparent text-center outline-none"
        />
      ) : canEdit ? (
        <button
          type="button"
          onDoubleClick={startEditing}
          className="nodrag break-words bg-transparent"
        >
          {data.label || id}
        </button>
      ) : (
        <span className="break-words">{data.label || id}</span>
      )}

      {canEdit && selected && !editing && (
        <div className="absolute -top-3 right-0 flex translate-x-full gap-1 pl-1">
          <button
            type="button"
            onClick={cycleShape}
            title="Mudar forma"
            aria-label="Mudar forma"
            className="rounded-md border border-border bg-card px-1 text-xs text-muted-foreground shadow-sm hover:text-foreground"
          >
            {SHAPE_LABEL[data.shape]}
          </button>
          <button
            type="button"
            onClick={() => deleteElements({ nodes: [{ id }] })}
            title="Remover nó"
            aria-label="Remover nó"
            className="rounded-md border border-border bg-card p-0.5 text-muted-foreground shadow-sm hover:text-destructive"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

export const mermaidNodeTypes = { mermaid: MermaidNode };

"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  useReactFlow,
} from "@xyflow/react";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MermaidEdge as MermaidEdgeType } from "@/lib/mermaid-graph";
import { useMermaidCanEdit } from "./mermaid-context";

export function MermaidEdge({
  id,
  data,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
}: EdgeProps<MermaidEdgeType>) {
  const { setEdges, updateEdgeData } = useReactFlow();
  const canEdit = useMermaidCanEdit();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data?.label ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    updateEdgeData(id, { label: draft.trim() || undefined });
  };

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            pointerEvents: "all",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          className="nodrag nopan flex items-center gap-1"
        >
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setEditing(false);
              }}
              placeholder="rótulo"
              className="w-20 rounded border border-border bg-background px-1 text-center text-xs outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                if (!canEdit) return;
                setDraft(data?.label ?? "");
                setEditing(true);
              }}
              className={cnLabel(Boolean(data?.label))}
            >
              {data?.label || (canEdit ? "+ rótulo" : "")}
            </button>
          )}
          {canEdit && !editing && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEdges((edges) => edges.filter((edge) => edge.id !== id));
              }}
              title="Remover conexão"
              aria-label="Remover conexão"
              className="rounded-full border border-border bg-background p-0.5 text-muted-foreground hover:border-destructive hover:text-destructive"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function cnLabel(hasLabel: boolean): string {
  return hasLabel
    ? "rounded border border-border bg-background px-1 text-xs text-foreground"
    : "rounded border border-dashed border-border bg-background px-1 text-[10px] text-muted-foreground";
}

export const mermaidEdgeTypes = { mermaidEdge: MermaidEdge };

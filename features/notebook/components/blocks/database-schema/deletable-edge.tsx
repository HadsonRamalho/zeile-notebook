import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  useReactFlow,
} from "@xyflow/react";
import { X } from "lucide-react";

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
}: EdgeProps) {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        {...(markerEnd !== undefined ? { markerEnd } : {})}
        {...(style !== undefined ? { style } : {})}
      />
      <EdgeLabelRenderer>
        <button
          type="button"
          style={{
            position: "absolute",
            pointerEvents: "all",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          className="nodrag nopan pointer-events-auto bg-background text-muted-foreground hover:text-destructive hover:border-destructive z-10 rounded-full border p-0.5"
          onClick={(e) => {
            e.stopPropagation();
            setEdges((edges) => edges.filter((edge) => edge.id !== id));
          }}
          title="Remover relacionamento"
          aria-label="Remover relacionamento"
        >
          <X size={10} />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

export const schemaEdgeTypes = { deletable: DeletableEdge };

"use client";

import "@xyflow/react/dist/style.css";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  type Edge,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import { Maximize2, Minimize2, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { schemaEdgeTypes } from "./deletable-edge";
import { type SchemaTableNode, schemaNodeTypes } from "./schema-table-node";

interface DatabaseSchemaGraph {
  nodes: SchemaTableNode[];
  edges: Edge[];
}

const emptyGraph: DatabaseSchemaGraph = { nodes: [], edges: [] };

const usersIdField = "users-id";
const postsUserIdField = "posts-user_id";

export const defaultDatabaseSchemaContent = JSON.stringify({
  nodes: [
    {
      id: "users",
      type: "schemaTable",
      position: { x: 0, y: 0 },
      data: {
        label: "users",
        schema: [
          { id: usersIdField, title: "id", type: "uuid" },
          { id: "users-name", title: "name", type: "text" },
        ],
      },
    },
    {
      id: "posts",
      type: "schemaTable",
      position: { x: 320, y: 0 },
      data: {
        label: "posts",
        schema: [
          { id: "posts-id", title: "id", type: "uuid" },
          { id: postsUserIdField, title: "user_id", type: "uuid" },
          { id: "posts-title", title: "title", type: "text" },
        ],
      },
    },
  ],
  edges: [
    {
      id: "users-posts",
      type: "deletable",
      source: "users",
      target: "posts",
      sourceHandle: usersIdField,
      targetHandle: postsUserIdField,
    },
  ],
} satisfies DatabaseSchemaGraph);

// content saved before fields had their own `id` used the field's name as
// the handle id; here every field without a stable `id` gets one, preserving
// existing connections by using the old handle (the field's name) as the
// migration reference.
function withStableFieldIds(graph: DatabaseSchemaGraph): DatabaseSchemaGraph {
  let changed = false;
  const idByOldHandle = new Map<string, string>();

  const nodes = graph.nodes.map((node) => {
    const schema = node.data?.schema;
    if (!Array.isArray(schema)) return node;

    const nextSchema = schema.map((field) => {
      if (field.id) return field;
      changed = true;
      const newId = crypto.randomUUID();
      idByOldHandle.set(`${node.id}:${field.title}`, newId);
      return { ...field, id: newId };
    });

    return changed
      ? { ...node, data: { ...node.data, schema: nextSchema } }
      : node;
  });

  if (!changed) return graph;

  const edges = graph.edges.map((edge) => {
    const sourceKey = `${edge.source}:${edge.sourceHandle}`;
    const targetKey = `${edge.target}:${edge.targetHandle}`;
    const sourceHandle =
      idByOldHandle.get(sourceKey) ?? edge.sourceHandle ?? null;
    const targetHandle =
      idByOldHandle.get(targetKey) ?? edge.targetHandle ?? null;
    return { ...edge, sourceHandle, targetHandle };
  });

  return { nodes, edges };
}

function parseGraph(content: string): DatabaseSchemaGraph {
  if (!content) return emptyGraph;
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      return withStableFieldIds(parsed);
    }
  } catch {
    // old/invalid content: start from an empty schema
  }
  return emptyGraph;
}

interface DatabaseSchemaCellProps {
  content: string;
  onChange: (content: string) => void;
  canWrite: boolean;
}

export function DatabaseSchemaCell({
  content,
  onChange,
  canWrite,
}: DatabaseSchemaCellProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const initial = useRef(parseGraph(content)).current;
  const [nodes, setNodes] = useState<SchemaTableNode[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);
  const lastSyncedContent = useRef(content);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactFlowRef = useRef<ReactFlowInstance<SchemaTableNode, Edge> | null>(
    null,
  );
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (content === lastSyncedContent.current) return;
    const graph = parseGraph(content);
    lastSyncedContent.current = content;
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [content]);

  useEffect(() => {
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const observer = new ResizeObserver(() => {
      reactFlowRef.current?.fitView({ padding: 0.2 });
    });
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  const commit = useCallback(
    (graph: DatabaseSchemaGraph) => {
      if (!canWrite) return;
      const serialized = JSON.stringify(graph);
      if (serialized === lastSyncedContent.current) return;
      lastSyncedContent.current = serialized;
      if (commitTimer.current) clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(() => onChange(serialized), 250);
    },
    [canWrite, onChange],
  );

  const addTable = useCallback(() => {
    setNodes((current) => {
      const next: SchemaTableNode[] = [
        ...current,
        {
          id: crypto.randomUUID(),
          type: "schemaTable",
          position: { x: 40 * current.length, y: 40 * current.length },
          data: {
            label: "nova_tabela",
            schema: [{ id: crypto.randomUUID(), title: "id", type: "uuid" }],
          },
        },
      ];
      commit({ nodes: next, edges });
      return next;
    });
  }, [commit, edges]);

  return (
    <div
      ref={wrapperRef}
      style={
        fullscreen
          ? undefined
          : {
              height: 480,
              minHeight: 480,
              maxHeight: 960,
              resize: "vertical",
              overflow: "auto",
            }
      }
      className={cn(
        "print:!h-auto print:!max-h-none print:!overflow-visible",
        fullscreen
          ? "fixed inset-0 z-overlay bg-background"
          : "relative w-full overflow-hidden rounded-lg border bg-card",
      )}
    >
      <div
        className={cn(
          "print:hidden absolute right-2 top-2 flex gap-2",
          fullscreen ? "z-overlay-controls" : "z-10",
        )}
      >
        {canWrite && (
          <button
            type="button"
            onClick={addTable}
            className="bg-card/85 text-muted-foreground hover:bg-accent hover:text-accent-foreground flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs shadow-lg backdrop-blur transition-colors"
            title="Adicionar tabela"
          >
            <Plus size={14} />
            Tabela
          </button>
        )}
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          className="bg-card/85 text-muted-foreground hover:bg-accent hover:text-accent-foreground rounded-md border border-border p-1.5 shadow-lg backdrop-blur transition-colors"
          title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
          aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
        >
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>
      <ReactFlow
        style={
          {
            "--xy-background-color": "var(--card)",
            "--xy-background-pattern-color": "var(--border)",
            "--xy-edge-stroke": "var(--muted-foreground)",
            "--xy-edge-stroke-selected": "var(--primary)",
            "--xy-node-border": "var(--border)",
            "--xy-node-background-color": "var(--card)",
            "--xy-node-color": "var(--foreground)",
            "--xy-selection-background-color":
              "color-mix(in oklab, var(--primary) 10%, transparent)",
            "--xy-selection-border": "1px solid var(--primary)",
            "--xy-handle-background-color": "var(--primary)",
            "--xy-handle-border-color": "var(--background)",
          } as React.CSSProperties
        }
        nodes={nodes}
        edges={edges}
        nodeTypes={schemaNodeTypes}
        edgeTypes={schemaEdgeTypes}
        nodesDraggable={canWrite}
        nodesConnectable={canWrite}
        elementsSelectable={canWrite}
        onNodesChange={(changes) => {
          setNodes((current) => {
            const next = applyNodeChanges(changes, current);
            commit({ nodes: next, edges });
            return next;
          });
        }}
        onEdgesChange={(changes) => {
          setEdges((current) => {
            const next = applyEdgeChanges(changes, current);
            commit({ nodes, edges: next });
            return next;
          });
        }}
        onConnect={(connection) => {
          setEdges((current) => {
            const next = addEdge({ ...connection, type: "deletable" }, current);
            commit({ nodes, edges: next });
            return next;
          });
        }}
        onInit={(instance) => {
          reactFlowRef.current = instance;
        }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
      >
        <Background />
        <Controls
          showInteractive={canWrite}
          className="print:hidden overflow-hidden rounded-xl border border-border bg-card/85 shadow-lg backdrop-blur"
          style={
            {
              "--xy-controls-button-background-color": "transparent",
              "--xy-controls-button-background-color-hover": "var(--accent)",
              "--xy-controls-button-color": "var(--muted-foreground)",
              "--xy-controls-button-color-hover": "var(--accent-foreground)",
              "--xy-controls-button-border-color": "var(--border)",
              "--xy-controls-box-shadow": "none",
            } as React.CSSProperties
          }
        />
      </ReactFlow>
    </div>
  );
}

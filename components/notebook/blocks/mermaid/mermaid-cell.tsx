"use client";

import "@xyflow/react/dist/style.css";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  ConnectionMode,
  Controls,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import { Code2, Maximize2, Minimize2, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  graphToMermaid,
  loadMermaidGraph,
  type MermaidEdge,
  type MermaidGraph,
  type MermaidNode,
  mermaidToGraph,
} from "@/lib/mermaid-graph";
import { cn } from "@/lib/utils";
import { BlockEditor } from "../block-editor";
import { MermaidEditContext } from "./mermaid-context";
import { mermaidEdgeTypes } from "./mermaid-edge";
import { mermaidNodeTypes } from "./mermaid-node";

export { defaultMermaidContent } from "@/lib/mermaid-graph";

interface MermaidCellProps {
  content: string;
  onChange: (content: string) => void;
  canWrite: boolean;
}

export function MermaidCell({ content, onChange, canWrite }: MermaidCellProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const initial = useRef(loadMermaidGraph(content)).current;
  const [direction, setDirection] = useState(initial.direction);
  const [nodes, setNodes] = useState<MermaidNode[]>(initial.nodes);
  const [edges, setEdges] = useState<MermaidEdge[]>(initial.edges);
  const [codeText, setCodeText] = useState("");
  const lastSynced = useRef(content);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flowRef = useRef<ReactFlowInstance<MermaidNode, MermaidEdge> | null>(
    null,
  );
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (content === lastSynced.current) return;
    const graph = loadMermaidGraph(content);
    lastSynced.current = content;
    setDirection(graph.direction);
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
      flowRef.current?.fitView({ padding: 0.2 });
    });
    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  const commit = useCallback(
    (graph: MermaidGraph) => {
      if (!canWrite) return;
      const serialized = JSON.stringify(graph);
      if (serialized === lastSynced.current) return;
      lastSynced.current = serialized;
      if (commitTimer.current) clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(() => onChange(serialized), 250);
    },
    [canWrite, onChange],
  );

  const addNode = useCallback(() => {
    setNodes((current) => {
      const next: MermaidNode[] = [
        ...current,
        {
          id: crypto.randomUUID(),
          type: "mermaid",
          position: { x: 60 * current.length, y: 60 * current.length },
          data: { label: "Novo nó", shape: "rect" },
        },
      ];
      commit({ direction, nodes: next, edges });
      return next;
    });
  }, [commit, direction, edges]);

  const openCode = () => {
    setCodeText(graphToMermaid({ direction, nodes, edges }));
    setShowCode(true);
  };

  const applyCode = useCallback(
    (text: string) => {
      setCodeText(text);
      const graph = mermaidToGraph(text);
      setDirection(graph.direction);
      setNodes(graph.nodes);
      setEdges(graph.edges);
      commit(graph);
    },
    [commit],
  );

  return (
    <div
      ref={wrapperRef}
      style={
        fullscreen
          ? undefined
          : {
              height: 420,
              minHeight: 420,
              resize: "vertical",
              overflow: "hidden",
            }
      }
      className={cn(
        "print:!h-auto print:!overflow-visible",
        fullscreen
          ? "fixed inset-0 z-overlay bg-background"
          : "relative w-full overflow-hidden rounded-lg border bg-card",
      )}
    >
      <div
        className={cn(
          "print:hidden absolute right-2 top-2 flex gap-1.5",
          fullscreen ? "z-overlay-controls" : "z-10",
        )}
      >
        {canWrite && (
          <button
            type="button"
            onClick={addNode}
            className="flex items-center gap-1 rounded-md border border-border bg-card/85 px-2 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent hover:text-accent-foreground"
            title="Adicionar nó"
          >
            <Plus size={14} />
            Nó
          </button>
        )}
        <button
          type="button"
          onClick={() => (showCode ? setShowCode(false) : openCode())}
          className={cn(
            "rounded-md border border-border bg-card/85 p-1.5 text-muted-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent hover:text-accent-foreground",
            showCode && "bg-accent text-accent-foreground",
          )}
          title="Ver código Mermaid"
          aria-label="Ver código Mermaid"
        >
          <Code2 size={16} />
        </button>
        <button
          type="button"
          onClick={() => setFullscreen((v) => !v)}
          className="rounded-md border border-border bg-card/85 p-1.5 text-muted-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent hover:text-accent-foreground"
          title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
          aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
        >
          {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      {showCode ? (
        <div className="h-full overflow-auto p-3 pt-12">
          <BlockEditor
            content={codeText}
            type="text"
            onBlur={() => {}}
            onChange={(value) => canWrite && applyCode(value)}
            readOnly={!canWrite}
            minHeight="120px"
            className="bg-muted"
          />
        </div>
      ) : (
        <MermaidEditContext.Provider value={canWrite}>
          <ReactFlow
            style={
              {
                "--xy-background-color": "var(--card)",
                "--xy-background-pattern-color": "var(--border)",
                "--xy-edge-stroke": "var(--muted-foreground)",
                "--xy-edge-stroke-selected": "var(--primary)",
                "--xy-handle-background-color": "var(--primary)",
                "--xy-handle-border-color": "var(--background)",
              } as React.CSSProperties
            }
            nodes={nodes}
            edges={edges}
            nodeTypes={mermaidNodeTypes}
            edgeTypes={mermaidEdgeTypes}
            connectionMode={ConnectionMode.Loose}
            nodesDraggable={canWrite}
            nodesConnectable={canWrite}
            elementsSelectable={canWrite}
            onNodesChange={(changes) => {
              setNodes((current) => {
                const next = applyNodeChanges(changes, current);
                commit({ direction, nodes: next, edges });
                return next;
              });
            }}
            onEdgesChange={(changes) => {
              setEdges((current) => {
                const next = applyEdgeChanges(changes, current);
                commit({ direction, nodes, edges: next });
                return next;
              });
            }}
            onConnect={(connection) => {
              setEdges((current) => {
                const next = addEdge(
                  { ...connection, type: "mermaidEdge", data: {} },
                  current,
                ) as MermaidEdge[];
                commit({ direction, nodes, edges: next });
                return next;
              });
            }}
            onInit={(instance) => {
              flowRef.current = instance;
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
                  "--xy-controls-button-background-color-hover":
                    "var(--accent)",
                  "--xy-controls-button-color": "var(--muted-foreground)",
                  "--xy-controls-button-color-hover":
                    "var(--accent-foreground)",
                  "--xy-controls-button-border-color": "var(--border)",
                  "--xy-controls-box-shadow": "none",
                } as React.CSSProperties
              }
            />
          </ReactFlow>
        </MermaidEditContext.Provider>
      )}
    </div>
  );
}

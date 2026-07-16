import type { Edge, Node } from "@xyflow/react";

export type MermaidShape = "rect" | "round" | "stadium" | "circle" | "diamond";
export type MermaidDirection = "TD" | "LR";

export interface MermaidNodeData {
  label: string;
  shape: MermaidShape;
  [key: string]: unknown;
}

export interface MermaidEdgeData {
  label?: string;
  [key: string]: unknown;
}

export type MermaidNode = Node<MermaidNodeData, "mermaid">;
export type MermaidEdge = Edge<MermaidEdgeData>;

export interface MermaidGraph {
  direction: MermaidDirection;
  nodes: MermaidNode[];
  edges: MermaidEdge[];
}

interface NodeToken {
  id: string;
  label?: string;
  shape?: MermaidShape;
}

interface RawEdge {
  source: string;
  target: string;
  label?: string;
}

const NODE_AT_START =
  /^([A-Za-z0-9_]+)\s*(\(\([^)]*\)\)|\(\[[^\]]*\]\)|\[[^\]]*\]|\([^)]*\)|\{[^}]*\})?/;
const CONNECTOR = /^\s*(?:-->|---|==>|-\.->)\s*(?:\|([^|]*)\|)?\s*/;
const CONNECTOR_LABEL = /^\s*--\s+([^->|]+?)\s+-->\s*/;

function parseNodeToken(token: string): NodeToken | null {
  const match = token.trim().match(NODE_AT_START);
  if (!match) return null;
  const id = match[1];
  const wrapped = match[2];
  if (!wrapped) return { id };
  if (wrapped.startsWith("((")) {
    return { id, label: wrapped.slice(2, -2), shape: "circle" };
  }
  if (wrapped.startsWith("([")) {
    return { id, label: wrapped.slice(2, -2), shape: "stadium" };
  }
  if (wrapped.startsWith("[")) {
    return { id, label: wrapped.slice(1, -1), shape: "rect" };
  }
  if (wrapped.startsWith("{")) {
    return { id, label: wrapped.slice(1, -1), shape: "diamond" };
  }
  if (wrapped.startsWith("(")) {
    return { id, label: wrapped.slice(1, -1), shape: "round" };
  }
  return { id };
}

function unquote(label: string): string {
  const trimmed = label.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function mermaidToGraph(text: string): MermaidGraph {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("%%"));

  let direction: MermaidDirection = "TD";
  const nodeMap = new Map<string, { label: string; shape: MermaidShape }>();
  const order: string[] = [];
  const rawEdges: RawEdge[] = [];

  const remember = (token: string): string | null => {
    const parsed = parseNodeToken(token);
    if (!parsed) return null;
    const existing = nodeMap.get(parsed.id);
    if (!existing) {
      order.push(parsed.id);
      nodeMap.set(parsed.id, {
        label: parsed.label !== undefined ? unquote(parsed.label) : parsed.id,
        shape: parsed.shape ?? "rect",
      });
    } else if (parsed.label !== undefined) {
      nodeMap.set(parsed.id, {
        label: unquote(parsed.label),
        shape: parsed.shape ?? existing.shape,
      });
    }
    return parsed.id;
  };

  for (const line of lines) {
    const dir = line.match(/^(?:graph|flowchart)\s+(TB|TD|LR|RL|BT)\b/i);
    if (dir) {
      const value = dir[1].toUpperCase();
      direction = value === "LR" || value === "RL" ? "LR" : "TD";
      continue;
    }

    let rest = line;
    const first = NODE_AT_START.exec(rest);
    if (!first) continue;
    let prev = remember(first[0]);
    rest = rest.slice(first[0].length);

    if (!rest.trim() && prev) continue;

    while (rest.trim()) {
      let label: string | undefined;
      const labelled = CONNECTOR_LABEL.exec(rest);
      if (labelled) {
        label = labelled[1].trim();
        rest = rest.slice(labelled[0].length);
      } else {
        const conn = CONNECTOR.exec(rest);
        if (!conn) break;
        label = conn[1]?.trim();
        rest = rest.slice(conn[0].length);
      }
      const nextMatch = NODE_AT_START.exec(rest);
      if (!nextMatch) break;
      const target = remember(nextMatch[0]);
      rest = rest.slice(nextMatch[0].length);
      if (prev && target) {
        rawEdges.push({ source: prev, target, label });
      }
      prev = target;
    }
  }

  return layoutGraph(direction, order, nodeMap, rawEdges);
}

function layoutGraph(
  direction: MermaidDirection,
  order: string[],
  nodeMap: Map<string, { label: string; shape: MermaidShape }>,
  rawEdges: RawEdge[],
): MermaidGraph {
  const layer = new Map<string, number>();
  for (const id of order) layer.set(id, 0);
  for (let pass = 0; pass < order.length; pass++) {
    let changed = false;
    for (const edge of rawEdges) {
      const next = (layer.get(edge.source) ?? 0) + 1;
      if (next > (layer.get(edge.target) ?? 0) && next < order.length + 1) {
        layer.set(edge.target, next);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const perLayer = new Map<number, number>();
  const gapMain = 140;
  const gapCross = 200;
  const nodes: MermaidNode[] = order.map((id) => {
    const depth = layer.get(id) ?? 0;
    const col = perLayer.get(depth) ?? 0;
    perLayer.set(depth, col + 1);
    const data = nodeMap.get(id) ?? {
      label: id,
      shape: "rect" as MermaidShape,
    };
    const position =
      direction === "LR"
        ? { x: depth * gapCross, y: col * gapMain }
        : { x: col * gapCross, y: depth * gapMain };
    return {
      id,
      type: "mermaid",
      position,
      data: { label: data.label, shape: data.shape },
    };
  });

  const edges: MermaidEdge[] = rawEdges.map((edge, index) => ({
    id: `e-${edge.source}-${edge.target}-${index}`,
    source: edge.source,
    target: edge.target,
    type: "mermaidEdge",
    data: edge.label ? { label: edge.label } : {},
  }));

  return { direction, nodes, edges };
}

function wrapLabel(label: string, shape: MermaidShape): string {
  const safe = `"${label.replace(/"/g, "'")}"`;
  switch (shape) {
    case "round":
      return `(${safe})`;
    case "stadium":
      return `([${safe}])`;
    case "circle":
      return `((${safe}))`;
    case "diamond":
      return `{${safe}}`;
    default:
      return `[${safe}]`;
  }
}

export function graphToMermaid(graph: MermaidGraph): string {
  const idMap = new Map<string, string>();
  const used = new Set<string>();
  for (const node of graph.nodes) {
    let safe = node.id.replace(/[^A-Za-z0-9_]/g, "_");
    if (!safe || /^[0-9]/.test(safe)) safe = `n_${safe}`;
    let candidate = safe;
    let suffix = 1;
    while (used.has(candidate)) {
      candidate = `${safe}_${suffix++}`;
    }
    used.add(candidate);
    idMap.set(node.id, candidate);
  }

  const lines = [`graph ${graph.direction}`];
  for (const node of graph.nodes) {
    const id = idMap.get(node.id) ?? node.id;
    lines.push(
      `  ${id}${wrapLabel(node.data.label || node.id, node.data.shape)}`,
    );
  }
  for (const edge of graph.edges) {
    const source = idMap.get(edge.source);
    const target = idMap.get(edge.target);
    if (!source || !target) continue;
    const label = edge.data?.label
      ? `|"${edge.data.label.replace(/"/g, "'")}"|`
      : "";
    lines.push(`  ${source} -->${label} ${target}`);
  }
  return lines.join("\n");
}

export function loadMermaidGraph(content: string): MermaidGraph {
  if (!content.trim()) return { direction: "TD", nodes: [], edges: [] };
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
      return {
        direction: parsed.direction === "LR" ? "LR" : "TD",
        nodes: parsed.nodes,
        edges: parsed.edges,
      };
    }
  } catch {
    // não é JSON: trata como texto Mermaid
  }
  return mermaidToGraph(content);
}

export function contentToMermaidText(content: string): string {
  return graphToMermaid(loadMermaidGraph(content));
}

export const defaultMermaidContent =
  "graph TD\n  A[Início] --> B{Decisão}\n  B -->|Sim| C[Fim]\n  B -->|Não| A";

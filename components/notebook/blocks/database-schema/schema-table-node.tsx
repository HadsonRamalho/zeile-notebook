import {
  type Node,
  type NodeProps,
  Position,
  useReactFlow,
} from "@xyflow/react";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { BaseHandle } from "@/components/ui/base-handle";
import { BaseNodeContent, BaseNodeHeader } from "@/components/ui/base-node";
import { DatabaseSchemaNode } from "@/components/ui/database-schema-node";

export interface SchemaField {
  id: string;
  title: string;
  type: string;
}

export interface SchemaTableData {
  label: string;
  schema: SchemaField[];
  [key: string]: unknown;
}

export type SchemaTableNode = Node<SchemaTableData, "schemaTable">;

export function SchemaTableNode({ id, data }: NodeProps<SchemaTableNode>) {
  const { updateNodeData, setEdges, deleteElements } = useReactFlow();

  const setLabel = (label: string) => updateNodeData(id, { label });

  const removeTable = () => {
    deleteElements({ nodes: [{ id }] });
  };

  const setField = (index: number, patch: Partial<SchemaField>) => {
    const schema = data.schema.map((field, i) =>
      i === index ? { ...field, ...patch } : field,
    );
    updateNodeData(id, { schema });
  };

  const addField = () => {
    updateNodeData(id, {
      schema: [
        ...data.schema,
        {
          id: crypto.randomUUID(),
          title: `campo_${data.schema.length + 1}`,
          type: "text",
        },
      ],
    });
  };

  const removeField = (index: number) => {
    const removed = data.schema[index];
    if (!removed) return;
    updateNodeData(id, { schema: data.schema.filter((_, i) => i !== index) });
    setEdges((edges) =>
      edges.filter(
        (edge) =>
          edge.sourceHandle !== removed.id && edge.targetHandle !== removed.id,
      ),
    );
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= data.schema.length) return;
    const schema = [...data.schema];
    const temp = schema[index]!;
    schema[index] = schema[target]!;
    schema[target] = temp;
    updateNodeData(id, { schema });
  };

  return (
    <DatabaseSchemaNode className="w-72">
      <BaseNodeHeader className="bg-secondary text-muted-foreground my-0 flex items-center gap-1 rounded-t-md px-2 py-1">
        <input
          value={data.label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="nome_da_tabela"
          className="nodrag w-full min-w-0 flex-1 bg-transparent text-center text-sm font-semibold outline-none"
        />
        <button
          type="button"
          onClick={removeTable}
          className="nodrag shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Remover tabela"
          aria-label="Remover tabela"
        >
          <Trash2 size={12} />
        </button>
      </BaseNodeHeader>
      <BaseNodeContent className="gap-1 p-2">
        {data.schema.map((field, index) => (
          <div
            key={field.id}
            className="relative flex items-center gap-1 text-xs"
          >
            <BaseHandle type="target" position={Position.Left} id={field.id} />
            <input
              value={field.title}
              onChange={(e) => setField(index, { title: e.target.value })}
              placeholder="campo"
              className="nodrag min-w-0 flex-1 bg-transparent px-1 py-0.5 outline-none"
            />
            <input
              value={field.type}
              onChange={(e) => setField(index, { type: e.target.value })}
              placeholder="tipo"
              className="nodrag text-muted-foreground w-16 shrink-0 bg-transparent px-1 py-0.5 text-right outline-none"
            />
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => moveField(index, -1)}
                disabled={index === 0}
                className="nodrag text-muted-foreground rounded p-0.5 hover:bg-muted disabled:opacity-30"
                title="Mover para cima"
                aria-label="Mover para cima"
              >
                <ArrowUp size={10} />
              </button>
              <button
                type="button"
                onClick={() => moveField(index, 1)}
                disabled={index === data.schema.length - 1}
                className="nodrag text-muted-foreground rounded p-0.5 hover:bg-muted disabled:opacity-30"
                title="Mover para baixo"
                aria-label="Mover para baixo"
              >
                <ArrowDown size={10} />
              </button>
              <button
                type="button"
                onClick={() => removeField(index)}
                className="nodrag text-muted-foreground rounded p-0.5 hover:bg-destructive/10 hover:text-destructive"
                title="Remover campo"
                aria-label="Remover campo"
              >
                <X size={10} />
              </button>
            </div>
            <BaseHandle type="source" position={Position.Right} id={field.id} />
          </div>
        ))}

        <button
          type="button"
          onClick={addField}
          className="nodrag text-muted-foreground mt-1 flex items-center justify-center gap-1 rounded p-1 text-xs hover:bg-muted"
        >
          <Plus size={12} />
          Campo
        </button>
      </BaseNodeContent>
    </DatabaseSchemaNode>
  );
}

export const schemaNodeTypes = { schemaTable: SchemaTableNode };

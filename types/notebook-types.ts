import type { components } from "@/lib/api/generated/openapi-types";
import type { Block } from "./block-types";

type Schemas = components["schemas"];

export type NotebookMeta = Omit<Schemas["NotebookDto"], "tags"> & {
  tags: string[];
};

export interface Notebook extends NotebookMeta {
  blocks: Block[];
}

export type PublicNotebookResponse = Schemas["PublicNotebookResponse"];

export type PublicNotebookDoc = Schemas["PublicNotebookDoc"];

export type RankedSearchItem = Omit<Schemas["RankedSearchItem"], "kind"> & {
  kind: "notebook" | "block";
};

import type { CalloutContainerProps } from "@/components/mdx/callout";
import type { BannerVariant } from "@/components/banner";

export type BlockType =
  | "text"
  | "code"
  | "component"
  | "drawing"
  | "free_drawing"
  | "database_schema"
  | "latex"
  | "sql"
  | "typst";

export type DrawingElement = {
  id: string;
  version: number;
  [key: string]: unknown;
};

export interface DrawingScene {
  elements: Record<string, DrawingElement>;
}
export type Language =
  | "rust"
  | "typescript"
  | "python"
  | "go"
  | "cpp"
  | "zig"
  | "generic";
export type RunStatus = "idle" | "success" | "error";
export type TsMode = "simple" | "advanced";

export type BlockComponentType =
  | "callout"
  | "card"
  | "steps"
  | "tabs"
  | "github_repo";

export interface CalloutMetadata {
  type: "callout";
  props: CalloutContainerProps;
}

export interface CardMetadata {
  type: "card";
  props: {
    title: string;
    description?: string;
    href?: string;
  };
}

export interface GithubRepoMetadata {
  type: "github_repo";
  props: {
    owner: string;
    repo: string;
  };
}

export interface BannerMetadata {
  type: "banner";
  variant: BannerVariant;
}

export type BlockMetadata =
  | CardMetadata
  | CalloutMetadata
  | GithubRepoMetadata
  | BannerMetadata
  | { type: "generic"; props?: Record<string, any> };

export interface Block {
  id: string;
  title: string;
  type: BlockType;
  content: string;
  language?: Language;
  metadata?: BlockMetadata;
  scene?: DrawingScene;
}

export interface NotebookMeta {
  id: string;
  title: string;
  createdAt: number;
}

export interface Notebook extends NotebookMeta {
  userId: string;
  blocks: Block[];
  isPublic: boolean;
  updatedAt: number;
}

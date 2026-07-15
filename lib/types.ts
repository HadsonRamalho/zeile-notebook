import type { BannerVariant } from "@/components/banner";
import type { CalloutContainerProps } from "@/components/mdx/callout";

export type BlockType =
  | "text"
  | "code"
  | "component"
  | "drawing"
  | "free_drawing"
  | "database_schema"
  | "latex"
  | "sql"
  | "typst"
  | "challenge"
  | "notebook_ref"
  | "template_ref"
  | "chart"
  | "mermaid";

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

export interface ChallengeMetadata {
  type: "challenge";
  props: {
    challengeId?: string;
  };
}

export interface NotebookRefMetadata {
  type: "notebook_ref";
  props: {
    notebookId?: string;
  };
}

export interface TemplateRefMetadata {
  type: "template_ref";
  props: {
    templateId?: string;
    version?: number;
  };
}

export interface TypstTemplateMetadata {
  type: "typst_template";
  props: {
    templateId: string;
    name: string;
  };
}

export type ChartType = "bar" | "line" | "area";

export interface ChartMetadata {
  type: "chart";
  props: {
    chartType: ChartType;
    sourceKind: "inline" | "cell";
    sourceBlockId?: string;
    x?: string;
    y?: string[];
  };
}

export type BlockMetadata =
  | CardMetadata
  | CalloutMetadata
  | GithubRepoMetadata
  | BannerMetadata
  | ChallengeMetadata
  | NotebookRefMetadata
  | TemplateRefMetadata
  | TypstTemplateMetadata
  | ChartMetadata
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
  folderId?: string | null;
  tags?: string[];
  publicSlug?: string | null;
}

export interface Notebook extends NotebookMeta {
  userId: string;
  blocks: Block[];
  isPublic: boolean;
  publicSlug?: string | null;
  updatedAt: number;
}

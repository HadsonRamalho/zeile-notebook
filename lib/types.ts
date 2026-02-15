import type { CalloutContainerProps } from "fumadocs-ui/components/callout";
import type { BannerVariant } from "@/components/banner";

export type BlockType = "text" | "code" | "component";
export type Language = "rust" | "typescript" | "python" | "go";
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

"use client";

import { Callout } from "fumadocs-ui/components/callout";
import { Card } from "fumadocs-ui/components/card";
import { Banner } from "@/components/banner";
import { GithubInfo } from "@/components/github-info";
import type { Block, BlockMetadata } from "@/lib/types";
import { TextBlock } from "../text/text-block";

interface ComponentRendererProps {
  block: Block;
  onCodeChange: (newContent: string) => void;
  updateBlockMetadata: (id: string, newMetadata: BlockMetadata) => void;
}

export function ComponentRenderer({
  block,
  onCodeChange,
  updateBlockMetadata,
}: ComponentRendererProps) {
  if (block.type !== "component" || !block.metadata) return null;

  switch (block.metadata.type) {
    case "callout": {
      return (
        <div className="group relative my-4">
          <Callout type={block.metadata.props?.type || "info"}>
            <TextBlock content={block.content} onChange={onCodeChange} />
          </Callout>
        </div>
      );
    }

    case "card":
      return (
        <div className="group relative my-4">
          <Card title={block.metadata.props.title}>
            <TextBlock content={block.content} onChange={onCodeChange} />
          </Card>
        </div>
      );

    case "github_repo":
      return (
        <div className="group relative my-4">
          <GithubInfo
            updateBlockMetadata={updateBlockMetadata}
            owner={block.metadata.props?.owner || "HadsonRamalho"}
            repo={block.metadata.props?.repo || "docs"}
            blockId={block.id}
          />
        </div>
      );

    case "banner":
      return (
        <div className="group relative my-4">
          <Banner
            changeLayout={false}
            variant={block.metadata.variant}
            className="rounded-md"
          >
            <TextBlock content={block.content} onChange={onCodeChange} />
          </Banner>
        </div>
      );

    default:
      return (
        <div className="p-4 border border-dashed border-white/10 rounded-lg italic text-gray-500">
          Componente {block.metadata.type} em desenvolvimento...
        </div>
      );
  }
}

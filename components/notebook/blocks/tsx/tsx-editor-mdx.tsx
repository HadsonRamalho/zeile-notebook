"use client";

import { useState } from "react";
import type { Block } from "@/lib/types";
import { TsxEditor } from "./tsx-editor";

interface TsxEditorMDXProps {
  id?: string;
  title?: string;
  initialCode?: string;
}

export function TsxEditorMDX({
  id = "mdx-tsx-example",
  title = "Componente React",
  initialCode = "export default function App() {\n  return <h1>Olá Mundo!</h1>;\n}",
}: TsxEditorMDXProps) {
  const [block, setBlock] = useState<Block>({
    id,
    title,
    type: "component",
    content: initialCode,
    language: "typescript",
  });

  const updateBlockAction = (blockId: string, newContent: string) => {
    if (blockId === id) {
      setBlock((prev) => ({ ...prev, content: newContent }));
    }
  };

  const setBlocksAction = (blocks: Block[]) => {
    console.log("Blocks atualizados (dummy):", blocks);
  };

  return (
    <div className="my-6 w-full">
      <TsxEditor
        block={block}
        pageBlocks={[block]}
        setBlocksAction={setBlocksAction}
        onCodeChange={(newContent) => updateBlockAction(block.id, newContent)}
      />
    </div>
  );
}

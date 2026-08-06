"use client";

import { useState } from "react";
import type { Block } from "@/types/block-types";
import PythonSandbox from "./python-editor";

interface PythonEditorMDXProps {
  id?: string;
  title?: string;
  initialCode?: string;
}

export function PythonEditorMDX({
  id = "mdx-example",
  title = "Exemplo Interativo",
  initialCode = 'print("Olá!")',
}: PythonEditorMDXProps) {
  const [code, setCode] = useState(initialCode);

  const block: Block = {
    id,
    title,
    type: "code",
    content: code,
    language: "python",
  };

  return (
    <PythonSandbox block={block} onCodeChange={setCode} isDragging={false} />
  );
}

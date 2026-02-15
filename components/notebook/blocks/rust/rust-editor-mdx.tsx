"use client";

import { useState } from "react";
import type { Block } from "@/lib/types";
import { RustEditor } from "./rust-editor";

interface RustEditorMDXProps {
  id?: string;
  title?: string;
  initialCode?: string;
}

export function RustEditorMDX({
  id = "mdx-example",
  title = "Exemplo Interativo",
  initialCode = 'fn main() {\n    println!("Olá, mundo!");\n}',
}: RustEditorMDXProps) {
  const [code, setCode] = useState(initialCode);

  const block: Block = {
    id,
    title,
    type: "code",
    content: code,
    language: "rust",
  };

  return (
    <RustEditor
      block={block}
      onCodeChange={setCode}
      isDragging={false}
      sessionId={"1234-1234-1234-1234"}
    />
  );
}

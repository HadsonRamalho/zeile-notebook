"use client";

import { useState } from "react";
import type { Block } from "@/lib/types";
import { ZigEditor } from "./zig-editor";

interface ZigEditorMDXProps {
  id?: string;
  title?: string;
  initialCode?: string;
}

export function ZigEditorMDX({
  id = "mdx-example",
  title = "Exemplo Interativo",
  initialCode = 'const std = @import("std");\n\npub fn main() !void {\n    const stdout = std.io.getStdOut().writer();\n    try stdout.print("Olá do Zig!\\n", .{});\n}',
}: ZigEditorMDXProps) {
  const [code, setCode] = useState(initialCode);

  const block: Block = {
    id,
    title,
    type: "code",
    content: code,
    language: "zig",
  };

  return (
    <ZigEditor
      block={block}
      onCodeChange={setCode}
      isDragging={false}
    />
  );
}

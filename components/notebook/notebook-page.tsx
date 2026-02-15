"use client";

import { getCookie } from "cookies-next";
import { Reorder } from "framer-motion";
import { RotateCw } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { useAutomergeSync } from "@/hooks/use-automerge-sync";
import { usePresence } from "@/hooks/use-presence";
import type { Block, BlockMetadata, BlockType, Language } from "@/lib/types";
import { InlineTOC } from "../inline-toc";
import { Button } from "../ui/button";
import { CollabChat } from "./collaboration/chat";
import { LiveCursors } from "./collaboration/live-cursors";
import { useNotebook } from "./notebook-context";
import { ReorderItem } from "./reorder/reorder-item";
import { ReorderTools } from "./reorder/reorder-tools";

interface RustInteractivePageProps {
  pageId: string;
}

export default function RustInteractivePage({
  pageId = "default",
}: RustInteractivePageProps) {
  const { user } = useAuth();
  const { isDragging, setIsDragging } = useNotebook();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const tokenX = getCookie("auth_token");
  const token = tokenX?.toString() || "";
  const sessionId = useRef(crypto.randomUUID()).current;

  const {
    doc,
    isConnected,
    hasSyncedOnce,
    addBlockSync,
    updateBlockContent,
    updateBlockMetadataSync,
    deleteBlock,
    reorderBlocks,
  } = useAutomergeSync(pageId, token);

  const {
    collaborators,
    updateCursor,
    messages,
    sendChatMessage,
    updateFocus,
  } = usePresence(pageId, user);

  const handlePointerMove = (e: React.PointerEvent) => {
    updateCursor(e.clientX, e.clientY);
  };

  const blocks = useMemo(() => {
    if (!doc || !doc.blocks) return [];
    const data = JSON.parse(JSON.stringify(doc.blocks));
    return data as Block[];
  }, [doc]);

  const getFileName = (title: string) => {
    return title.replace(/[^a-zA-Z0-9]/g, "_");
  };

  const pageFiles = blocks.reduce(
    (acc, b) => {
      if (b.type === "code" && b.language === "typescript" && b.title) {
        let name = b.title.replace(/[^a-zA-Z0-9]/g, "_");
        if (/^\d/.test(name)) name = `_${name}`;

        acc[`/${name}.tsx`] = {
          code: b.content,
          hidden: true,
        };
      }
      return acc;
    },
    {} as Record<string, any>,
  );

  const handleAddBlock = (
    index: number,
    type: BlockType,
    language?: Language,
    metadata?: BlockMetadata,
  ) => {
    const content =
      type === "code" ? getInitialCode(language ?? "rust") : "Escreva aqui";
    const title = getBlockTitle(type, language ?? "rust", blocks.length);

    addBlockSync(index, type, content, language, title, metadata);
    setHoveredIndex(null);
  };

  if (!doc || !hasSyncedOnce) {
    return (
      <div className="flex h-screen w-full items-center justify-center text-muted-foreground">
        <h2>Conectando ao servidor...</h2>
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center text-muted-foreground space-y-4">
        <h2>Esta página está vazia.</h2>
        <Button
          onClick={() => handleAddBlock(-1, "text")}
          className="px-4 py-2 bg-fd-primary text-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          Adicionar Primeiro Bloco
        </Button>
      </div>
    );
  }

  return (
    <div
      onPointerMove={handlePointerMove}
      className="min-h-screen flex flex-row w-full print:block print:min-h-0 print:h-auto print:m-0 print:p-0 print:bg-white print:text-black"
    >
      <CollabChat messages={messages} sendChatMessage={sendChatMessage} />
      <LiveCursors collaborators={collaborators} />
      {!isConnected && <Refreshing />}
      <Reorder.Group
        axis="y"
        values={blocks}
        onReorder={reorderBlocks}
        className="space-y-4 w-full"
      >
        {blocks.map((block, index) => {
          const focusedUsers = collaborators.filter(
            (c) => c.focusedBlockId === block.id,
          );
          const borderColor =
            focusedUsers.length > 0 ? focusedUsers[0].color : "transparent";

          const blockName = getFileName(block.title);
          const currentBlockFileName = `/${blockName}.tsx`;
          const isTS = block.language === "typescript";
          const filesForThisBlock = {
            ...pageFiles,
            [currentBlockFileName]: block.content,
          };

          if (isTS) {
            filesForThisBlock["/App.tsx"] = {
              code: `import { App as Component } from "./${blockName}"; export default function Main() { return <Component />; }`,
              hidden: true,
            };
          }
          delete filesForThisBlock[currentBlockFileName];

          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: <Necessário pra controlar o render>
            <div
              key={block.id}
              onFocus={() => updateFocus(block.id)}
              onBlur={() => updateFocus(null)}
              className="relative group overflow-visible"
              style={{
                boxShadow:
                  focusedUsers.length > 0 ? `0 0 0 2px ${borderColor}` : "none",
              }}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <ReorderTools
                hoveredIndex={hoveredIndex}
                index={index}
                addBlock={handleAddBlock}
              />

              {focusedUsers.length > 0 && (
                <div className="absolute -top-3 right-4 flex -space-x-2 z-10">
                  {focusedUsers.map((user) => (
                    <div
                      key={user.id}
                      className="size-6 rounded-full border-2 border-white flex items-center justify-center text-[10px] text-white font-bold"
                      style={{ backgroundColor: user.color }}
                      title={`${user.name} está editando`}
                    >
                      {user.name.charAt(0)}
                    </div>
                  ))}
                </div>
              )}

              <ReorderItem
                block={block}
                isDragging={isDragging}
                pageFiles={pageFiles}
                pageBlocks={blocks}
                setBlocks={() => {}}
                setIsDragging={setIsDragging}
                removeBlock={deleteBlock}
                updateBlock={updateBlockContent}
                updateBlockMetadata={updateBlockMetadataSync}
                sessionId={sessionId}
              />
            </div>
          );
        })}
      </Reorder.Group>
      <aside className="hidden xl:block w-70 print:hidden">
        <div className="sticky top-24">
          <InlineTOC blocks={blocks} />
        </div>
      </aside>
    </div>
  );
}

function getInitialCode(language: Language): string {
  const templates: Record<Language, string> = {
    rust: '// Escreva seu código Rust aqui :))\nfn main() {\n    println!("Olá mundo!");\n}',
    typescript:
      "export default function App() {\n  return <h1>Olá React!</h1>\n}",
    python: 'import math \nprint(f"O valor de PI é {math.pi}")',
    go: 'package main\nimport "fmt"\nfunc main() {\n\tfmt.Println("Hello, Go!")\n}',
  };

  return templates[language] ?? templates.python;
}

function getBlockTitle(
  type: BlockType,
  language: Language,
  blockCount: number,
): string {
  if (type !== "code") return "Bloco de Texto";

  const titles: Record<string, string> = {
    typescript: `Componente_${blockCount}`,
    rust: "file.rs",
    python: "script.py",
    go: "main.go",
  };

  return titles[language] ?? "Arquivo de Código";
}

const Refreshing = () => {
  return (
    <div className="absolute md:fixed flex items-center gap-2 md:top-4 right-4 bg-yellow-500 text-white px-3 py-1 rounded-md text-sm z-10 animate-pulse">
      <RotateCw className="animate-spin size-4" />
      Sincronizando...
    </div>
  );
};

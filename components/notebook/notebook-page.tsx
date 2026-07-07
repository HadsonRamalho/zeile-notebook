"use client";

import { getCookie } from "cookies-next";
import { Reorder } from "framer-motion";
import { Check, Eye, Plus, RotateCw, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AppNotFound } from "@/components/motion/not-found";
import { useAuth } from "@/context/auth-context";
import { useAutomergeSync } from "@/hooks/use-automerge-sync";
import { usePresence } from "@/hooks/use-presence";
import { getUserNotebookPermissions } from "@/lib/api/notebook-service";
import type {
  Block,
  BlockMetadata,
  BlockType,
  Language,
  Notebook,
} from "@/lib/types";
import type { TeamRole } from "@/lib/types/team-types";
import { InlineTOC } from "../inline-toc";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollProgress } from "../ui/scroll-progress";
import { defaultDatabaseSchemaContent } from "./blocks/database-schema/database-schema-cell";
import { CollabBar } from "./collaboration/collab-bar";
import { LiveCursors } from "./collaboration/live-cursors";
import { useNotebook } from "./notebook-context";
import { ReorderItem } from "./reorder/reorder-item";
import { ReorderTools } from "./reorder/reorder-tools";

interface RustInteractivePageProps {
  pageId: string;
  header?: ReactNode;
}

export default function RustInteractivePage({
  pageId = "default",
  header,
}: RustInteractivePageProps) {
  const { user } = useAuth();
  const { isDragging, setIsDragging, notebook } = useNotebook();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const tokenX = getCookie("auth_token");
  const token = tokenX?.toString() || "";
  const sessionId = useRef(crypto.randomUUID()).current;
  const [userPermissions, setUserPermissions] = useState<TeamRole | null>(null);

  const {
    doc,
    isConnected,
    hasSyncedOnce,
    addBlockSync,
    updateBlockContent,
    updateBlockMetadataSync,
    updateDrawingScene,
    restoreState,
    deleteBlock,
    reorderBlocks,
    buildAutomergeHistory,
  } = useAutomergeSync(pageId, token);

  const {
    socketUserId,
    collaborators,
    updateCursor,
    messages,
    sendChatMessage,
    updateFocus,
  } = usePresence(pageId, user);

  const AUTOMERGE_HISTORY_PAGE_SIZE = 50;
  const [automergeHistory, setAutomergeHistory] = useState<
    Awaited<ReturnType<typeof buildAutomergeHistory>>
  >([]);
  const [automergeHistoryVisibleCount, setAutomergeHistoryVisibleCount] =
    useState(AUTOMERGE_HISTORY_PAGE_SIZE);
  const [isLoadingAutomergeHistory, setIsLoadingAutomergeHistory] =
    useState(false);
  const [automergeHistoryProgress, setAutomergeHistoryProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const handleLoadAutomergeHistory = async () => {
    setIsLoadingAutomergeHistory(true);
    setAutomergeHistoryProgress(null);
    const result = await buildAutomergeHistory((done, total) =>
      setAutomergeHistoryProgress({ done, total }),
    );
    setAutomergeHistory(result);
    setAutomergeHistoryVisibleCount(AUTOMERGE_HISTORY_PAGE_SIZE);
    setIsLoadingAutomergeHistory(false);
    setAutomergeHistoryProgress(null);
  };

  const handleLoadMoreAutomergeHistory = () => {
    setAutomergeHistoryVisibleCount((n) => n + AUTOMERGE_HISTORY_PAGE_SIZE);
  };

  const [activeCollabTab, setActiveCollabTab] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<Notebook | null>(null);
  const displayDoc = previewDoc || doc;

  const handleCancelPreview = () => {
    setPreviewDoc(null);
  };

  const handleConfirmRestore = () => {
    if (previewDoc?.blocks) {
      restoreState(previewDoc.blocks);
      setPreviewDoc(null);
      setActiveCollabTab(null);
    }
  };

  useEffect(() => {
    const loadUserPermissions = async () => {
      const tempPermissions = await getUserNotebookPermissions(pageId);
      setUserPermissions(tempPermissions);
    };
    if (!userPermissions && (isConnected || hasSyncedOnce)) {
      loadUserPermissions();
    }
  }, [userPermissions, hasSyncedOnce, pageId, isConnected]);

  const blocks = useMemo(() => {
    if (!displayDoc || !displayDoc.blocks) return [];
    const data = JSON.parse(JSON.stringify(displayDoc.blocks));
    return data as Block[];
  }, [displayDoc]);

  const handlePointerMove = (e: React.PointerEvent) => {
    updateCursor(e.clientX, e.clientY);
  };

  const handleAddBlock = (
    index: number,
    type: BlockType,
    language?: Language,
    metadata?: BlockMetadata,
  ) => {
    const content =
      type === "code"
        ? getInitialCode(language ?? "rust")
        : type === "drawing" || type === "free_drawing"
          ? ""
          : type === "database_schema"
            ? defaultDatabaseSchemaContent
            : "Escreva aqui";
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
          <Plus className="mr-2 h-4 w-4" />
          Adicionar Primeiro Bloco
        </Button>
      </div>
    );
  }

  if (!userPermissions?.can_read) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <AppNotFound variant="forbidden" />
      </div>
    );
  }

  return (
    <div
      onPointerMove={handlePointerMove}
      className="min-h-screen flex flex-row w-full print:block print:min-h-0 print:h-auto print:m-0 print:p-0 print:bg-white print:text-black"
    >
      <CollabBar
        canWriteHistory={userPermissions.can_write}
        automergeHistory={automergeHistory}
        automergeHistoryVisibleCount={automergeHistoryVisibleCount}
        isLoadingAutomergeHistory={isLoadingAutomergeHistory}
        automergeHistoryProgress={automergeHistoryProgress}
        onLoadAutomergeHistory={handleLoadAutomergeHistory}
        onLoadMoreAutomergeHistory={handleLoadMoreAutomergeHistory}
        previewDoc={previewDoc}
        setPreviewDoc={setPreviewDoc}
        messages={messages}
        sendChatMessage={sendChatMessage}
        socketUserId={socketUserId}
        collaborators={collaborators}
        currentUser={user}
        activeTab={activeCollabTab}
        onActiveTabChange={setActiveCollabTab}
      />
      <LiveCursors collaborators={collaborators} />

      {!isConnected && <Refreshing />}

      {previewDoc && (
        <PreviewDialog
          handleCancelPreview={handleCancelPreview}
          handleConfirmRestore={handleConfirmRestore}
        />
      )}

      <div className="flex flex-1 min-w-0 flex-col">
      {header}
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
              {userPermissions?.can_write && (
                <ReorderTools
                  hoveredIndex={hoveredIndex}
                  index={index}
                  addBlock={handleAddBlock}
                />
              )}

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
                pageBlocks={blocks}
                pageFiles={{}}
                setBlocks={() => {}}
                setIsDragging={setIsDragging}
                removeBlock={deleteBlock}
                updateBlock={updateBlockContent}
                updateBlockMetadata={updateBlockMetadataSync}
                updateDrawingScene={updateDrawingScene}
                doc={doc}
                sessionId={sessionId}
                canWrite={!previewDoc && !!userPermissions?.can_write}
              />
            </div>
          );
        })}
      </Reorder.Group>
      </div>
      <aside className="hidden xl:block w-70 print:hidden">
        <div className="sticky top-24">
          <ScrollProgress className="top-0.5" />
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
    cpp: '#include <iostream>\n\nusing namespace std;\n\nint main(){\n\tcout << "Olá!" << endl;\n\treturn 0;\n}',
    zig: 'const std = @import("std");\n\npub fn main() !void {\n    const stdout = std.io.getStdOut().writer();\n    try stdout.print("Hello, {s}!\\n", .{"Zig"});\n}',
    generic: "",
  };

  return templates[language] ?? templates.python;
}

function getBlockTitle(
  type: BlockType,
  language: Language,
  blockCount: number,
): string {
  if (type === "drawing") return "Excalidraw";
  if (type === "free_drawing") return "Desenho";
  if (type === "database_schema") return "Database Schema";
  if (type !== "code") return "Bloco de Texto";

  const titles: Record<string, string> = {
    typescript: `Componente_${blockCount}`,
    rust: "file.rs",
    python: "script.py",
    go: "main.go",
    cpp: "main.cpp",
    zig: "main.zig",
    generic: "Code",
  };

  return titles[language] ?? "Arquivo de Código";
}

function Refreshing() {
  return (
    <div className="absolute md:fixed flex items-center gap-2 md:top-4 right-4 bg-yellow-500 text-white px-3 py-1 rounded-md text-sm z-10 animate-pulse">
      <RotateCw className="animate-spin size-4" />
      Sincronizando...
    </div>
  );
}

interface PreviewDialogProps {
  handleCancelPreview: () => void;
  handleConfirmRestore: () => void;
}

function PreviewDialog({
  handleCancelPreview,
  handleConfirmRestore,
}: PreviewDialogProps) {
  return (
    <div className="fixed top-12 mt-4 md:top-6 left-1/2 -translate-x-1/2 w-[90%] md:w-auto bg-amber-500/95 backdrop-blur-md border border-amber-400 text-white px-4 py-3 md:px-5 rounded-2xl md:rounded-full shadow-2xl z-100 flex flex-col md:flex-row items-center gap-3 md:gap-4 animate-in slide-in-from-top-4 fade-in duration-300">
      <div className="flex items-center gap-2">
        <Eye className="size-4 md:size-5" />
        <span className="font-semibold text-sm md:text-base tracking-tight whitespace-nowrap">
          Modo de Pré-visualização
        </span>
      </div>

      <div className="w-full h-px md:w-px md:h-6 bg-white/20 md:bg-amber-400/50" />

      <div className="flex items-center justify-center gap-2 w-full md:w-auto">
        <Button
          onClick={handleCancelPreview}
          variant="ghost"
          className="flex-1 md:flex-none h-9 px-4 text-white hover:bg-amber-600 rounded-xl md:rounded-full transition-colors text-xs md:text-sm"
        >
          <X className="size-4 mr-1" />
          Cancelar
        </Button>
        <Button
          onClick={handleConfirmRestore}
          className="flex-1 md:flex-none h-9 px-4 bg-white text-amber-600 hover:bg-amber-50 rounded-xl md:rounded-full font-bold shadow-sm transition-colors text-xs md:text-sm"
        >
          <Check className="size-4 mr-1" />
          Restaurar
        </Button>
      </div>
    </div>
  );
}


"use client";

import { getCookie } from "cookies-next";
import { Reorder } from "framer-motion";
import { Check, Eye, History, RotateCw, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { useAutomergeSync } from "@/hooks/use-automerge-sync";
import {
  type HistorySnapshot,
  useLocalHistory,
} from "@/hooks/use-local-history";
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
import { CollabChat } from "./collaboration/chat";
import { LiveCursors } from "./collaboration/live-cursors";
import { PresenceBubble } from "./collaboration/presence-bubble";
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
  } = useAutomergeSync(pageId, token);

  const {
    socketUserId,
    collaborators,
    updateCursor,
    messages,
    sendChatMessage,
    updateFocus,
  } = usePresence(pageId, user);

  const { history } = useLocalHistory(doc);

  const [isOpen, setIsOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<Notebook | null>(null);
  const displayDoc = previewDoc || doc;

  const handleCancelPreview = () => {
    setPreviewDoc(null);
  };

  const handleConfirmRestore = () => {
    if (previewDoc?.blocks) {
      restoreState(previewDoc.blocks);
      setPreviewDoc(null);
      setIsOpen(false);
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
        : type === "drawing"
          ? ""
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
          Adicionar Primeiro Bloco
        </Button>
      </div>
    );
  }

  if (!userPermissions?.can_read) {
    return (
      <div className="flex h-screen w-full items-center justify-center text-red-700/60">
        <h2>Você não tem permissão para visualizar essa página.</h2>
      </div>
    );
  }

  return (
    <div
      onPointerMove={handlePointerMove}
      className="min-h-screen flex flex-row w-full print:block print:min-h-0 print:h-auto print:m-0 print:p-0 print:bg-white print:text-black"
    >
      <CollabChat messages={messages} sendChatMessage={sendChatMessage} />
      <PresenceBubble
        socketUserId={socketUserId}
        collaborators={collaborators}
        currentUser={user}
      />
      <LiveCursors collaborators={collaborators} />

      {!isConnected && <Refreshing />}

      {previewDoc && (
        <PreviewDialog
          handleCancelPreview={handleCancelPreview}
          handleConfirmRestore={handleConfirmRestore}
        />
      )}

      {userPermissions.can_write && (
        <HistoryButton isOpen={isOpen} setIsOpen={setIsOpen} />
      )}

      {isOpen && (
        <HistoryDialog
          setIsOpen={setIsOpen}
          history={history}
          previewDoc={previewDoc}
          setPreviewDoc={setPreviewDoc}
        />
      )}

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
  if (type === "drawing") return "Desenho";
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

interface HistoryButtonProps {
  setIsOpen: (o: boolean) => void;
  isOpen: boolean;
}

function HistoryButton({ setIsOpen, isOpen }: HistoryButtonProps) {
  return (
    <Button
      onClick={() => setIsOpen(!isOpen)}
      className="fixed top-20 right-4 md:right-8 h-12 w-12 rounded-full bg-fd-secondary text-fd-primary shadow-2xl z-2 hover:scale-105 transition-all flex items-center justify-center"
      title="Histórico de Edições"
    >
      <History className="size-6" />
    </Button>
  );
}

interface HistoryDialogProps {
  setIsOpen: (o: boolean) => void;
  history: HistorySnapshot[];
  previewDoc: Notebook | null;
  setPreviewDoc: (d: Notebook | null) => void;
}

function HistoryDialog({
  setIsOpen,
  history,
  previewDoc,
  setPreviewDoc,
}: HistoryDialogProps) {
  return (
    <div className="fixed bottom-24 right-6 z-10 w-80 bg-background/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl p-5 max-h-100 flex flex-col animate-in slide-in-from-bottom-8 fade-in duration-300">
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/50">
        <div className="flex items-center justify-center gap-3">
          <span className="font-semibold text-sm flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            Histórico
          </span>
          <Badge className="flex items-center justify-center">
            {history.length} {history.length === 1 ? "versão" : "versões"}
          </Badge>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full hover:bg-destructive/10 group transition-colors"
          onClick={() => setIsOpen(false)}
        >
          <X className="size-4 text-muted-foreground group-hover:text-destructive transition-colors" />
        </Button>
      </div>

      <div className="flex-1 max-h-[20vh] md:max-h-100 overflow-y-scroll pr-2 -mr-2 space-y-2">
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma alteração detectada.
          </p>
        ) : (
          history.map((snap, index) => {
            const isSelected = previewDoc === snap.doc;
            return (
              <Button
                key={index}
                onClick={() => setPreviewDoc(snap.doc)}
                className={`w-full text-left p-3 text-sm rounded-xl border transition-all ${
                  isSelected
                    ? "bg-primary/10 border-primary text-primary shadow-sm"
                    : "bg-muted/30 border-transparent hover:border-border hover:bg-muted/60"
                }`}
              >
                <div className="text-xs flex items-center gap-1">
                  <RotateCw className="size-3" />
                  {snap.timestamp.toLocaleTimeString()}
                </div>
              </Button>
            );
          })
        )}
      </div>
    </div>
  );
}

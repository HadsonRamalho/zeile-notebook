"use client";

import { getCookie } from "cookies-next";
import { Reorder } from "framer-motion";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  Plus,
  RotateCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Fragment,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { ScrollProgress } from "../ui/scroll-progress";
import { defaultDatabaseSchemaContent } from "./blocks/database-schema/database-schema-cell";
import { defaultLatexContent } from "./blocks/latex/latex-cell";
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
    restoreBlock,
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

  // automergeHistory[0] é a versão mais recente; índices crescem para
  // versões mais antigas (ver buildAutomergeHistory).
  const previewIndex = automergeHistory.findIndex(
    (entry) => entry.doc === previewDoc,
  );
  const hasOlderPreview =
    previewIndex !== -1 && previewIndex + 1 < automergeHistory.length;
  const hasNewerPreview = previewIndex > 0;

  const handlePreviewOlder = () => {
    if (!hasOlderPreview) return;
    setPreviewDoc(automergeHistory[previewIndex + 1].doc);
  };

  const handlePreviewNewer = () => {
    if (!hasNewerPreview) return;
    setPreviewDoc(automergeHistory[previewIndex - 1].doc);
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
            : type === "latex"
              ? defaultLatexContent
              : "Escreva aqui";
    const title = getBlockTitle(type, language ?? "rust", blocks.length);

    addBlockSync(index, type, content, language, title, metadata);
  };

  // Deletar um bloco não pede confirmação (fricção alta demais para uma ação
  // do dia a dia), mas também não é definitivo: um toast com "Desfazer"
  // reinsere o bloco exato (mesmo id/conteúdo) na mesma posição.
  const handleDeleteBlock = (id: string) => {
    const index = blocks.findIndex((b) => b.id === id);
    const removed = blocks[index];
    if (!removed) return;
    deleteBlock(id);
    toast(`Bloco "${removed.title || "sem título"}" excluído.`, {
      action: {
        label: "Desfazer",
        onClick: () => restoreBlock(index, removed),
      },
    });
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
      className="min-h-screen flex flex-col w-full print:block print:min-h-0 print:h-auto print:m-0 print:p-0 print:bg-white print:text-black"
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
      <ScrollProgress />

      {!isConnected && <Refreshing />}

      {previewDoc && (
        <PreviewDialog
          handleCancelPreview={handleCancelPreview}
          handleConfirmRestore={handleConfirmRestore}
          onOlder={handlePreviewOlder}
          onNewer={handlePreviewNewer}
          hasOlder={hasOlderPreview}
          hasNewer={hasNewerPreview}
        />
      )}

      <div className="flex flex-1 min-w-0 flex-col">
      {header}
      <Reorder.Group
        axis="y"
        values={blocks}
        onReorder={reorderBlocks}
        className="w-full"
      >
        {blocks.map((block, index) => {
          const focusedUsers = collaborators.filter(
            (c) => c.focusedBlockId === block.id,
          );
          const borderColor =
            focusedUsers.length > 0 ? focusedUsers[0].color : "transparent";

          return (
            <Fragment key={block.id}>
              {userPermissions?.can_write && (
                <ReorderTools index={index - 1} addBlock={handleAddBlock} />
              )}

              <div
                onFocus={() => updateFocus(block.id)}
                onBlur={() => updateFocus(null)}
                className="relative overflow-visible"
                style={{
                  boxShadow:
                    focusedUsers.length > 0
                      ? `0 0 0 2px ${borderColor}`
                      : "none",
                }}
              >
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
                  removeBlock={handleDeleteBlock}
                  updateBlock={updateBlockContent}
                  updateBlockMetadata={updateBlockMetadataSync}
                  updateDrawingScene={updateDrawingScene}
                  doc={doc}
                  sessionId={sessionId}
                  canWrite={!previewDoc && !!userPermissions?.can_write}
                />
              </div>

              {userPermissions?.can_write && index === blocks.length - 1 && (
                <ReorderTools index={index} addBlock={handleAddBlock} />
              )}
            </Fragment>
          );
        })}
      </Reorder.Group>
      </div>
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
  if (type === "latex") return "LaTeX";
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
    <div className="absolute md:fixed flex items-center gap-2 md:top-4 right-4 bg-accent-violet text-accent-violet-foreground px-3 py-1 rounded-md text-sm z-10 animate-pulse">
      <RotateCw className="animate-spin size-4" />
      Sincronizando...
    </div>
  );
}

interface PreviewDialogProps {
  handleCancelPreview: () => void;
  handleConfirmRestore: () => void;
  onOlder: () => void;
  onNewer: () => void;
  hasOlder: boolean;
  hasNewer: boolean;
}

function PreviewDialog({
  handleCancelPreview,
  handleConfirmRestore,
  onOlder,
  onNewer,
  hasOlder,
  hasNewer,
}: PreviewDialogProps) {
  return (
    <div className="fixed bottom-4 left-1/2 z-overlay flex w-[min(26rem,92vw)] -translate-x-1/2 flex-col items-center gap-3 rounded-2xl border border-border bg-card/85 px-4 py-3 text-foreground shadow-lg backdrop-blur-lg animate-in slide-in-from-bottom-4 fade-in duration-300 md:w-auto md:flex-row md:gap-4 md:px-5">
      <div className="flex items-center gap-2 text-primary">
        <Eye className="size-4 md:size-5" />
        <span className="font-semibold text-sm md:text-base tracking-tight whitespace-nowrap">
          Modo de Pré-visualização
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onNewer}
          disabled={!hasNewer}
          aria-label="Versão mais recente"
          title="Versão mais recente"
          className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronUp className="size-4" />
        </button>
        <button
          type="button"
          onClick={onOlder}
          disabled={!hasOlder}
          aria-label="Versão mais antiga"
          title="Versão mais antiga"
          className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronDown className="size-4" />
        </button>
      </div>

      <div className="h-px w-full bg-border md:h-6 md:w-px" />

      <div className="flex w-full items-center justify-center gap-2 md:w-auto">
        <Button
          onClick={handleCancelPreview}
          variant="ghost"
          className="flex-1 md:flex-none h-9 px-4 rounded-xl md:rounded-full transition-colors text-xs md:text-sm"
        >
          <X className="size-4 mr-1" />
          Cancelar
        </Button>
        <Button
          onClick={handleConfirmRestore}
          className="flex-1 md:flex-none h-9 px-4 rounded-xl md:rounded-full font-bold transition-colors text-xs md:text-sm"
        >
          <Check className="size-4 mr-1" />
          Restaurar
        </Button>
      </div>
    </div>
  );
}


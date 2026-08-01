"use client";

import { getCookie } from "cookies-next";
import { Reorder } from "framer-motion";
import { tokenCookieName } from "@/lib/runtime/router";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  Eye,
  FileText,
  GitCompareArrows,
  Presentation,
  RotateCw,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { AppNotFound } from "@/components/motion/not-found";
import { useAuth } from "@/context/auth-context";
import { useAutomergeSync } from "@/hooks/use-automerge-sync";
import { useCapabilities } from "@/hooks/use-capabilities";
import { usePresence } from "@/hooks/use-presence";
import { recordEditActivity } from "@/lib/api/activity-service";
import { useBlockAnchor } from "@/lib/notebook-anchor";
import { subscribeNotebookSocket } from "@/lib/notebook-socket";
import { consumePendingImport } from "@/lib/pendingImport";
import type {
  Block,
  BlockMetadata,
  BlockType,
  Language,
  Notebook,
} from "@/lib/types";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { ScrollProgress } from "../ui/scroll-progress";
import { defaultChartContent } from "./blocks/chart/chart-cell";
import { defaultDatabaseSchemaContent } from "./blocks/database-schema/database-schema-cell";
import { defaultLatexContent } from "./blocks/latex/latex-cell";
import { defaultMermaidContent } from "./blocks/mermaid/mermaid-cell";
import { defaultSqlContent } from "./blocks/sql/sql-cell";
import { defaultTypstContent } from "./blocks/typst/typst-cell";
import { ActivityFeed } from "./collaboration/activity-feed";
import { CollabBar } from "./collaboration/collab-bar";
import { FollowBar } from "./collaboration/follow-bar";
import { LiveCursors } from "./collaboration/live-cursors";
import { BlockComments } from "./comments/block-comments";
import { CommentsProvider } from "./comments/comments-context";
import { HistoryDiffView } from "./history/history-diff-view";
import { SnapshotsPanel } from "./history/snapshots-panel";
import { useNotebook } from "./notebook-context";
import { CapabilitiesProvider } from "./permissions/capabilities";
import { PresentationMode } from "./presentation/presentation-mode";
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
  const tEmpty = useTranslations("empty_states");
  const tPresent = useTranslations("presentation");
  const [presenting, setPresenting] = useState(false);
  const { user } = useAuth();
  const { isDragging, setIsDragging, setLiveNotebook } = useNotebook();
  const tokenX = getCookie(tokenCookieName());
  const token = tokenX?.toString() || "";
  const capabilities = useCapabilities(pageId);
  const {
    can: canDo,
    ready: capabilitiesReady,
    refetch: refetchCapabilities,
  } = capabilities;
  const userPermissions = useMemo(
    () =>
      capabilitiesReady
        ? {
            can_read: canDo("notebook.view"),
            can_write: canDo("notebook.edit"),
          }
        : null,
    [canDo, capabilitiesReady],
  );

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

  useEffect(() => {
    if (doc) setLiveNotebook(doc);
  }, [doc, setLiveNotebook]);
  useEffect(() => () => setLiveNotebook(null), [setLiveNotebook]);

  const {
    socketUserId,
    collaborators,
    updateCursor,
    messages,
    sendChatMessage,
    editMessage,
    deleteMessage,
    updateFocus,
    updateViewport,
  } = usePresence(pageId, user, refetchCapabilities);

  const [followingId, setFollowingId] = useState<string | null>(null);
  const isAutoScrollingRef = useRef(false);
  const lastEditPingRef = useRef(0);

  const pingEdit = useCallback(() => {
    if (!userPermissions?.can_write) return;
    const now = Date.now();
    if (now - lastEditPingRef.current < 30000) return;
    lastEditPingRef.current = now;
    recordEditActivity(pageId).catch(() => {});
  }, [pageId, userPermissions]);

  const trackedUpdateBlock = useCallback(
    (id: string, val: string) => {
      updateBlockContent(id, val);
      pingEdit();
    },
    [updateBlockContent, pingEdit],
  );

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

  const [showHistoryDiff, setShowHistoryDiff] = useState(false);
  const diffFromDoc = hasOlderPreview
    ? automergeHistory[previewIndex + 1]?.doc
    : previewIndex === 0
      ? doc
      : null;

  const handlePreviewOlder = () => {
    if (!hasOlderPreview) return;
    setPreviewDoc(automergeHistory[previewIndex + 1].doc);
  };

  const handlePreviewNewer = () => {
    if (!hasNewerPreview) return;
    setPreviewDoc(automergeHistory[previewIndex - 1].doc);
  };

  const blocks = useMemo(() => {
    if (!displayDoc?.blocks) return [];
    const data = JSON.parse(JSON.stringify(displayDoc.blocks));
    return data as Block[];
  }, [displayDoc]);

  useBlockAnchor(blocks.length > 0);

  const followed = collaborators.find((c) => c.id === followingId);
  const followedViewport = followed?.viewportBlockId ?? null;

  useEffect(() => {
    const computeTop = () => {
      const els = document.querySelectorAll<HTMLElement>("[data-block-id]");
      let bestId: string | null = null;
      let bestTop = Number.POSITIVE_INFINITY;
      for (const el of els) {
        const rect = el.getBoundingClientRect();
        if (rect.bottom > 140 && rect.top < bestTop) {
          bestTop = rect.top;
          bestId = el.getAttribute("data-block-id");
        }
      }
      return bestId;
    };
    const onScroll = () => {
      updateViewport(computeTop());
      if (followingId && !isAutoScrollingRef.current) {
        setFollowingId(null);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [updateViewport, followingId]);

  useEffect(() => {
    if (!followingId || !followedViewport) return;
    const el = document.querySelector<HTMLElement>(
      `[data-block-id="${CSS.escape(followedViewport)}"]`,
    );
    if (!el) return;
    isAutoScrollingRef.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    const timer = window.setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, 700);
    return () => window.clearTimeout(timer);
  }, [followingId, followedViewport]);

  useEffect(() => {
    if (!followingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFollowingId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [followingId]);

  useEffect(() => {
    const handle = subscribeNotebookSocket(pageId, token, {
      onText: (raw) => {
        try {
          const data = JSON.parse(raw);
          if (data.type === "notebook_restored") {
            window.location.reload();
          }
        } catch {}
      },
    });
    return () => handle.unsubscribe();
  }, [pageId, token]);

  const hasAppliedPendingImport = useRef(false);

  useEffect(() => {
    if (hasAppliedPendingImport.current) return;
    if (!userPermissions?.can_write || blocks.length === 0) return;

    const imported = consumePendingImport();
    hasAppliedPendingImport.current = true;
    if (!imported) return;

    const firstBlock = blocks[0];
    const nextContent = firstBlock.content
      ? `${firstBlock.content}\n\n${imported}`
      : imported;
    updateBlockContent(firstBlock.id, nextContent);
  }, [blocks, userPermissions, updateBlockContent]);

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
              : type === "sql"
                ? defaultSqlContent
                : type === "typst"
                  ? defaultTypstContent
                  : type === "chart"
                    ? defaultChartContent
                    : type === "mermaid"
                      ? defaultMermaidContent
                      : "";
    const title = getBlockTitle(type, language ?? "rust", blocks.length);

    addBlockSync(index, type, content, language, title, metadata);
    pingEdit();
  };

  // Deletar um bloco não pede confirmação (fricção alta demais para uma ação
  // do dia a dia), mas também não é definitivo: um toast com "Desfazer"
  // reinsere o bloco exato (mesmo id/conteúdo) na mesma posição.
  const blocksRootRef = useRef<HTMLDivElement>(null);

  const focusBlockAt = useCallback((index: number) => {
    const root = blocksRootRef.current;
    if (!root || index < 0) return;
    root.querySelector<HTMLElement>(`[data-block-index="${index}"]`)?.focus();
  }, []);

  const handleBlockKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>, index: number) => {
      const wrapper = e.currentTarget;
      const onWrapper = e.target === wrapper;

      if (e.key === "Escape") {
        if (!onWrapper) {
          e.stopPropagation();
          wrapper.focus();
        }
        return;
      }

      if (!onWrapper) return;

      if (e.key === "Tab") {
        e.preventDefault();
        focusBlockAt(index + (e.shiftKey ? -1 : 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        focusBlockAt(index + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusBlockAt(index - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const trigger = wrapper.querySelector<HTMLElement>(
          "[data-edit-trigger]",
        );
        if (trigger) {
          trigger.click();
        } else {
          wrapper
            .querySelector<HTMLElement>(
              '.cm-content, textarea, [contenteditable="true"]',
            )
            ?.focus();
        }
      }
    },
    [focusBlockAt],
  );

  const handleMoveBlock = (id: string, direction: -1 | 1) => {
    const index = blocks.findIndex((b) => b.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    reorderBlocks(next);
    pingEdit();
  };

  const handleDeleteBlock = (id: string) => {
    const index = blocks.findIndex((b) => b.id === id);
    const removed = blocks[index];
    if (!removed) return;
    deleteBlock(id);
    pingEdit();
    toast(`Bloco "${removed.title || "sem título"}" excluído.`, {
      action: {
        label: "Desfazer",
        onClick: () => restoreBlock(index, removed),
      },
    });
  };

  if (!doc || !hasSyncedOnce || !userPermissions) {
    return (
      <div className="flex h-screen w-full items-center justify-center text-muted-foreground">
        <h2>Conectando ao servidor...</h2>
      </div>
    );
  }

  if (!userPermissions.can_read) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <AppNotFound variant="forbidden" />
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center px-6">
        <EmptyState
          icon={<FileText className="size-5" />}
          title={tEmpty("notebook_title")}
          description={
            userPermissions.can_write
              ? tEmpty("notebook_desc")
              : tEmpty("notebook_readonly_desc")
          }
          hint={userPermissions.can_write ? tEmpty("run_hint") : undefined}
        >
          {userPermissions.can_write && (
            <>
              <Button
                onClick={() => handleAddBlock(-1, "text")}
                className="gap-2"
              >
                <FileText className="size-4" />
                {tEmpty("add_text_block")}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleAddBlock(-1, "code", "rust")}
                className="gap-2"
              >
                <Code2 className="size-4" />
                {tEmpty("add_code_block")}
              </Button>
            </>
          )}
        </EmptyState>
      </div>
    );
  }

  return (
    <CapabilitiesProvider value={capabilities}>
      <CommentsProvider
        notebookId={pageId}
        token={token}
        canComment={!!userPermissions.can_write}
        currentUserId={user?.id}
      >
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
            notebookId={pageId}
            messages={messages}
            sendChatMessage={sendChatMessage}
            editMessage={editMessage}
            deleteMessage={deleteMessage}
            socketUserId={socketUserId}
            collaborators={collaborators}
            currentUser={user}
            activeTab={activeCollabTab}
            onActiveTabChange={setActiveCollabTab}
          />
          <LiveCursors collaborators={collaborators} />
          <ScrollProgress />

          {!previewDoc && (
            <button
              type="button"
              onClick={() => setPresenting(true)}
              title={tPresent("present")}
              className="fixed bottom-6 right-6 z-floating flex items-center gap-2 rounded-full border border-border bg-card/85 px-4 py-2.5 text-sm font-medium text-foreground shadow-lg backdrop-blur-md transition-colors hover:text-primary print:hidden"
            >
              <Presentation className="size-4" />
              {tPresent("present")}
            </button>
          )}

          {!previewDoc && (
            <div className="fixed bottom-6 left-6 z-floating flex items-center gap-2 print:hidden">
              <FollowBar
                collaborators={collaborators}
                followingId={followingId}
                onFollow={setFollowingId}
                onStop={() => setFollowingId(null)}
              />
              <ActivityFeed notebookId={pageId} />
              {userPermissions.can_write && (
                <SnapshotsPanel notebookId={pageId} />
              )}
            </div>
          )}

          {presenting && (
            <PresentationMode
              blocks={blocks}
              doc={displayDoc}
              notebookId={pageId}
              updateBlock={updateBlockContent}
              updateBlockMetadata={updateBlockMetadataSync}
              updateDrawingScene={updateDrawingScene}
              onClose={() => setPresenting(false)}
            />
          )}

          {!isConnected && <Refreshing />}

          {previewDoc && (
            <PreviewDialog
              handleCancelPreview={handleCancelPreview}
              handleConfirmRestore={handleConfirmRestore}
              onOlder={handlePreviewOlder}
              onNewer={handlePreviewNewer}
              hasOlder={hasOlderPreview}
              hasNewer={hasNewerPreview}
              canCompare={!!diffFromDoc}
              onCompare={() => setShowHistoryDiff(true)}
            />
          )}

          {showHistoryDiff && previewDoc && diffFromDoc && (
            <HistoryDiffView
              fromDoc={diffFromDoc}
              toDoc={previewDoc}
              onClose={() => setShowHistoryDiff(false)}
            />
          )}

          <div ref={blocksRootRef} className="flex flex-1 min-w-0 flex-col">
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
                  focusedUsers.length > 0
                    ? focusedUsers[0].color
                    : "transparent";

                return (
                  <Fragment key={block.id}>
                    {userPermissions?.can_write && (
                      <ReorderTools
                        index={index - 1}
                        addBlock={handleAddBlock}
                      />
                    )}

                    <div
                      tabIndex={0}
                      data-block-index={index}
                      data-block-id={block.id}
                      onKeyDown={(e) => handleBlockKeyDown(e, index)}
                      onFocus={() => updateFocus(block.id)}
                      onBlur={() => updateFocus(null)}
                      className="group/block relative overflow-visible rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      style={{
                        boxShadow:
                          focusedUsers.length > 0
                            ? `0 0 0 2px ${borderColor}`
                            : "none",
                      }}
                    >
                      {!previewDoc && (
                        <div className="absolute -right-1 top-1 z-10 print:hidden">
                          <BlockComments blockId={block.id} />
                        </div>
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
                        removeBlock={handleDeleteBlock}
                        moveBlock={handleMoveBlock}
                        updateBlock={trackedUpdateBlock}
                        updateBlockMetadata={updateBlockMetadataSync}
                        updateDrawingScene={updateDrawingScene}
                        doc={doc}
                        notebookId={pageId}
                        canWrite={!previewDoc && !!userPermissions?.can_write}
                      />
                    </div>

                    {userPermissions?.can_write &&
                      index === blocks.length - 1 && (
                        <ReorderTools index={index} addBlock={handleAddBlock} />
                      )}
                  </Fragment>
                );
              })}
            </Reorder.Group>
          </div>
        </div>
      </CommentsProvider>
    </CapabilitiesProvider>
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
  if (type === "sql") return "SQL";
  if (type === "typst") return "Typst";
  if (type === "challenge") return "Desafio";
  if (type === "chart") return "Gráfico";
  if (type === "mermaid") return "Mermaid";
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
  canCompare: boolean;
  onCompare: () => void;
}

function PreviewDialog({
  handleCancelPreview,
  handleConfirmRestore,
  onOlder,
  onNewer,
  hasOlder,
  hasNewer,
  canCompare,
  onCompare,
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
        {canCompare && (
          <button
            type="button"
            onClick={onCompare}
            aria-label="Comparar com anterior"
            title="Comparar com anterior"
            className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <GitCompareArrows className="size-4" />
          </button>
        )}
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

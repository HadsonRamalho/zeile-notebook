import type * as AutomergeType from "@automerge/automerge";
import diff from "fast-diff";
import { get, set } from "idb-keyval";
import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { writeSceneElements } from "@/lib/drawing-scene";
import {
  type NotebookSocketHandle,
  subscribeNotebookSocket,
} from "@/lib/notebook-socket";
import type {
  Block,
  BlockMetadata,
  BlockType,
  DrawingElement,
  Language,
  Notebook,
} from "@/lib/types";

type AutomergeLib = typeof AutomergeType;

export interface AutomergeHistoryEntry {
  timestamp: Date;
  message: string | null;
  doc: Notebook;
}

export function useAutomergeSync(notebookId: string, token: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [hasSyncedOnce, setHasSyncedOnce] = useState(false);

  const [doc, setDoc] = useState<Notebook | null>(null);

  const docRef = useRef<Notebook | null>(null);
  const automerge = useRef<AutomergeLib | null>(null);
  const syncState = useRef<AutomergeType.SyncState | null>(null);
  const handleRef = useRef<NotebookSocketHandle | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      const automergex = await import("@automerge/automerge");
      if (!isMounted) return;

      automerge.current = automergex;
      syncState.current = automergex.initSyncState();

      const cachedBinary = await get(`notebook_${notebookId}`);
      let initialDoc: Notebook;

      if (cachedBinary && cachedBinary instanceof Uint8Array) {
        try {
          initialDoc = automergex.load<Notebook>(cachedBinary);
          setHasSyncedOnce(true);
        } catch (e) {
          console.error("Erro ao carregar notebook do cache:", e);
          initialDoc = automergex.init<Notebook>();
        }
      } else {
        initialDoc = automergex.init<Notebook>();
      }

      docRef.current = initialDoc;
      setDoc(initialDoc);
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [notebookId]);

  const persistLocally = useCallback(
    async (currentDoc: Notebook) => {
      if (!automerge.current) return;
      const binary = automerge.current.save(currentDoc);
      await set(`notebook_${notebookId}`, binary);
    },
    [notebookId],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: !!doc não é lido no corpo (que usa docRef.current), mas dispara a (re)conexão quando o doc fica disponível
  useEffect(() => {
    if (!notebookId || !automerge.current || !docRef.current) return;

    // single shared socket; reconnection/backoff lives in the notebook-socket manager
    const handle = subscribeNotebookSocket(notebookId, token, {
      onOpen: () => {
        setIsConnected(true);
        // new sync state on every (re)connection
        syncState.current = automerge.current!.initSyncState();
        if (automerge.current && docRef.current) {
          const [nextSyncState, message] =
            automerge.current.generateSyncMessage(
              docRef.current,
              syncState.current,
            );
          syncState.current = nextSyncState;
          if (message) handleRef.current?.sendBinary(message);
        }
      },
      onClose: () => setIsConnected(false),
      onBinary: (buf) => {
        if (!automerge.current || !docRef.current) return;

        const binaryMessage = new Uint8Array(buf);
        const currentDoc = docRef.current;

        const [nextDoc, nextSyncState] = automerge.current.receiveSyncMessage(
          currentDoc,
          syncState.current!,
          binaryMessage,
        );
        syncState.current = nextSyncState;

        if (nextDoc !== currentDoc) {
          docRef.current = nextDoc;
          setDoc(nextDoc);
          persistLocally(nextDoc);
        }

        if (!hasSyncedOnce) setHasSyncedOnce(true);

        const [updatedSyncState, responseMessage] =
          automerge.current.generateSyncMessage(nextDoc, syncState.current);
        syncState.current = updatedSyncState;

        if (responseMessage) handleRef.current?.sendBinary(responseMessage);
      },
    });

    handleRef.current = handle;

    return () => {
      handle.unsubscribe();
      handleRef.current = null;
    };
  }, [notebookId, token, !!doc, persistLocally, hasSyncedOnce]);

  const updateDoc = useCallback(
    (callback: (d: Notebook) => void) => {
      if (!automerge.current || !docRef.current) return;

      const newDoc = automerge.current.change(docRef.current, callback);

      docRef.current = newDoc;
      setDoc(newDoc);
      persistLocally(newDoc);

      const [nextSyncState, message] = automerge.current.generateSyncMessage(
        newDoc,
        syncState.current!,
      );
      syncState.current = nextSyncState;

      if (message) handleRef.current?.sendBinary(message);
    },
    [persistLocally],
  );

  const addBlockSync = (
    index: number,
    type: BlockType,
    content = "",
    language?: Language,
    title = "",
    metadata?: BlockMetadata,
  ) =>
    updateDoc((d) => {
      const newBlock: Block = {
        id: uuidv4(),
        title,
        type,
        content,
        ...(language !== undefined ? { language } : {}),
        ...(metadata !== undefined ? { metadata } : {}),
        ...(type === "drawing" ? { scene: { elements: {} } } : {}),
      };
      if (!d.blocks) d.blocks = [];
      d.blocks.splice(index + 1, 0, newBlock);
    });

  const updateBlockContent = (blockId: string, newContent: string) => {
    updateDoc((d) => {
      const blockIndex = d.blocks.findIndex((b) => b.id === blockId);
      if (blockIndex === -1) return;

      const block = d.blocks[blockIndex];
      const currentContent = block.content;

      if (currentContent === newContent) return;

      const diffs = diff(currentContent, newContent);

      let index = 0;
      const am = automerge.current;
      if (!am) return;

      const propPath = ["blocks", blockIndex, "content"];

      diffs.forEach(([operation, text]) => {
        if (operation === 0) {
          index += text.length;
        } else if (operation === -1) {
          am.splice(d, propPath, index, text.length);
        } else if (operation === 1) {
          am.splice(d, propPath, index, 0, text);
          index += text.length;
        }
      });
    });
  };

  const restoreState = (oldBlocks: Block[]) => {
    updateDoc((d) => {
      d.blocks = JSON.parse(JSON.stringify(oldBlocks));
    });
  };

  const updateBlockMetadataSync = (
    blockId: string,
    meta: BlockMetadata | undefined,
  ) => {
    updateDoc((d) => {
      const block = d.blocks.find((b) => b.id === blockId);
      if (block) {
        if (meta === undefined) {
          delete block.metadata;
        } else {
          block.metadata = meta;
        }
      }
    });
  };

  const updateDrawingScene = (
    blockId: string,
    elements: readonly DrawingElement[],
  ) => {
    updateDoc((d) => {
      writeSceneElements(d, blockId, elements);
    });
  };

  const deleteBlock = (blockId: string) => {
    updateDoc((d) => {
      const index = d.blocks.findIndex((b) => b.id === blockId);
      if (index !== -1) {
        d.blocks.splice(index, 1);
      }
    });
  };

  // Reinserts a removed block at the same position, preserving id/content —
  // used by the "Undo" toast after deleting, so it doesn't generate a new
  // block (different id) in place of the original.
  const restoreBlock = (index: number, block: Block) => {
    updateDoc((d) => {
      if (!d.blocks) d.blocks = [];
      const clean: Block = JSON.parse(JSON.stringify(block));
      d.blocks.splice(index, 0, clean);
    });
  };

  const reorderBlocks = (newOrder: Block[]) => {
    updateDoc((d) => {
      const cleanOrder = JSON.parse(JSON.stringify(newOrder));
      d.blocks = cleanOrder;
    });
  };

  // Real history derived from Automerge's change log — the single source of
  // truth for versioning (the interval-based in-memory polling,
  // `useLocalHistory`, was removed: it restarted its own timer on every
  // `doc` change, so continuous, fast edits — like drawing — never let the
  // 5s interval complete, and session history stayed blind to those blocks).
  //
  // Native `automerge.getHistory()` is O(n²): each entry has a lazy getter
  // that rebuilds the snapshot from SCRATCH (`applyChanges(init(),
  // history.slice(0, index+1))`), so requesting the snapshot for all n
  // entries costs 1+2+...+n applications — that's what froze the tab on
  // documents with many changes. Here we rebuild incrementally
  // (applying 1 change at a time onto the accumulator, O(n) total) and
  // yield the main thread on every slice via `setTimeout`, so even a
  // large history doesn't block the UI all at once. The result is
  // cached (by doc reference) to avoid recomputing for nothing.
  const automergeHistoryCache = useRef<{
    forDoc: Notebook;
    entries: AutomergeHistoryEntry[];
  } | null>(null);
  const HISTORY_CHUNK_SIZE = 200;

  const buildAutomergeHistory = useCallback(
    async (
      onProgress?: (done: number, total: number) => void,
    ): Promise<AutomergeHistoryEntry[]> => {
      const lib = automerge.current;
      const currentDoc = docRef.current;
      if (!lib || !currentDoc) return [];

      if (automergeHistoryCache.current?.forDoc === currentDoc) {
        return automergeHistoryCache.current.entries;
      }

      const changes = lib.getAllChanges(currentDoc);
      const total = changes.length;
      const entries: AutomergeHistoryEntry[] = [];

      let acc = lib.init<Notebook>();
      for (let i = 0; i < total; i++) {
        const change = changes[i];
        if (!change) continue;
        const [next] = lib.applyChanges<Notebook>(acc, [change]);
        acc = next;
        const decoded = lib.decodeChange(change);
        entries.push({
          timestamp: new Date(decoded.time * 1000),
          message: decoded.message,
          doc: acc,
        });
        if (i % HISTORY_CHUNK_SIZE === HISTORY_CHUNK_SIZE - 1) {
          onProgress?.(i + 1, total);
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      onProgress?.(total, total);

      // Mais recente primeiro.
      entries.reverse();
      automergeHistoryCache.current = { forDoc: currentDoc, entries };
      return entries;
    },
    [],
  );

  return {
    doc,
    isConnected,
    hasSyncedOnce,
    addBlockSync,
    restoreState,
    updateBlockContent,
    updateBlockMetadataSync,
    updateDrawingScene,
    deleteBlock,
    restoreBlock,
    reorderBlocks,
    buildAutomergeHistory,
  };
}

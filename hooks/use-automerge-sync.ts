import type * as AutomergeType from "@automerge/automerge";
import diff from "fast-diff";
import { get, set } from "idb-keyval";
import { useCallback, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type {
  Block,
  BlockMetadata,
  BlockType,
  DrawingElement,
  Language,
  Notebook,
} from "@/lib/types";
import { writeSceneElements } from "@/lib/drawing-scene";
import {
  type NotebookSocketHandle,
  subscribeNotebookSocket,
} from "@/lib/notebook-socket";

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
  const syncState = useRef<any>(null);
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

  useEffect(() => {
    if (!notebookId || !automerge.current || !docRef.current) return;

    // socket único compartilhado; reconexão/backoff no gerenciador notebook-socket
    const handle = subscribeNotebookSocket(notebookId, token, {
      onOpen: () => {
        setIsConnected(true);
        // novo estado de sync a cada (re)conexão
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
          syncState.current,
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
        syncState.current,
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
        type: type as any,
        content,
        ...(language !== undefined ? { language: language as any } : {}),
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

  const updateBlockMetadataSync = (blockId: string, meta: any) => {
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

  // Reinsere um bloco removido na mesma posição, preservando id/conteúdo —
  // usado pelo toast de "Desfazer" após deletar, para não gerar um bloco
  // novo (id trocado) no lugar do original.
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

  // Histórico real derivado do log de changes do Automerge — fonte única de
  // versionamento (o polling in-memory por intervalo, `useLocalHistory`, foi
  // removido: ele reiniciava o próprio timer a cada mudança de `doc`, então
  // edições contínuas e rápidas — como desenhar — nunca deixavam o intervalo
  // de 5s completar, e o histórico de sessão ficava cego a esses blocos).
  //
  // O `automerge.getHistory()` nativo é O(n²): cada entrada tem um getter
  // preguiçoso que reconstrói o snapshot do ZERO (`applyChanges(init(),
  // history.slice(0, index+1))`), então pedir o snapshot de todas as n
  // entradas custa 1+2+...+n aplicações — era isso que travava a aba em
  // documentos com muitas alterações. Aqui reconstruímos incrementalmente
  // (aplica 1 change de cada vez sobre o acumulador, O(n) no total) e
  // cedemos a thread principal a cada fatia via `setTimeout`, então mesmo um
  // histórico grande não bloqueia a UI de uma vez só. O resultado fica em
  // cache (por referência do doc) pra não recalcular à toa.
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

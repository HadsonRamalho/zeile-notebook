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

type AutomergeLib = typeof AutomergeType;

export function useAutomergeSync(notebookId: string, token: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [hasSyncedOnce, setHasSyncedOnce] = useState(false);

  const [doc, setDoc] = useState<Notebook | null>(null);

  const docRef = useRef<Notebook | null>(null);
  const automerge = useRef<AutomergeLib | null>(null);
  const syncState = useRef<any>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function init() {
      const automergex = await import("@automerge/automerge");
      if (!isMounted) return;

      automerge.current = automergex;
      syncState.current = automergex.initSyncState();

      // Tenta carregar do IndexedDB
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

    let reconnectTimer: NodeJS.Timeout;

    const connect = () => {
      if (
        socketRef.current?.readyState === WebSocket.OPEN ||
        socketRef.current?.readyState === WebSocket.CONNECTING
      ) {
        return;
      }

      // Inicializa um novo estado de sincronização para cada nova conexão
      syncState.current = automerge.current!.initSyncState();

      const validToken = token.length > 0;
      const protocol =
        window.location.protocol === "https:" ? "wss://" : "ws://";
      const host =
        process.env.NEXT_PUBLIC_WS_URL?.replace(/^https?:\/\//, "") || "";
      const wsUrl = `${protocol}${host}/notebook/ws/${notebookId}`;

      const protocols = validToken ? ["access_token", token] : undefined;
      const socket = new WebSocket(wsUrl, protocols);
      socket.binaryType = "arraybuffer";

      socketRef.current = socket;

      const handleOpen = () => {
        setIsConnected(true);
        console.log("WebSocket connected to notebook:", notebookId);

        if (automerge.current && docRef.current) {
          const [nextSyncState, message] =
            automerge.current.generateSyncMessage(
              docRef.current,
              syncState.current,
            );
          syncState.current = nextSyncState;
          if (message && socket.readyState === WebSocket.OPEN) {
            socket.send(message);
          }
        }
      };

      const handleClose = () => {
        setIsConnected(false);
        console.log("WebSocket disconnected from notebook:", notebookId);
        reconnectTimer = setTimeout(connect, 3000);
      };

      const handleMessage = (event: MessageEvent) => {
        if (!automerge.current || !docRef.current) return;

        const binaryMessage = new Uint8Array(event.data);
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

        if (!hasSyncedOnce) {
          console.log("Initial sync completed for notebook:", notebookId);
          setHasSyncedOnce(true);
        }

        const [updatedSyncState, responseMessage] =
          automerge.current.generateSyncMessage(nextDoc, syncState.current);

        syncState.current = updatedSyncState;

        if (responseMessage && socket.readyState === WebSocket.OPEN) {
          socket.send(responseMessage);
        }
      };

      socket.addEventListener("open", handleOpen);
      socket.addEventListener("close", handleClose);
      socket.addEventListener("message", handleMessage);
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);

      if (socketRef.current) {
        socketRef.current.onopen = null;
        socketRef.current.onclose = null;
        socketRef.current.onmessage = null;

        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [notebookId, token, !!doc, persistLocally]);

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

      if (message && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(message);
      }
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

  const reorderBlocks = (newOrder: Block[]) => {
    updateDoc((d) => {
      const cleanOrder = JSON.parse(JSON.stringify(newOrder));
      d.blocks = cleanOrder;
    });
  };

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
    reorderBlocks,
  };
}

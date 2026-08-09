import { catchErrorSync } from "@catcherjs/core";
import { getCookie } from "cookies-next";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type NotebookSocketHandle,
  subscribeNotebookSocket,
} from "@/features/notebook/lib/notebook-socket";
import {
  type ChatMessageDTO,
  deleteNotebookMessage,
  editNotebookMessage,
  fetchNotebookMessages,
  sendNotebookMessage,
} from "@/lib/api/chat-service";
import type {
  WsClientMessage,
  WsServerMessage,
} from "@/lib/api/generated/ws-message";
import { tokenCookieName } from "@/lib/runtime/router";
import type { User } from "@/types/user-types";

type PresenceUpdate = {
  userId?: string;
  name?: string | null;
  avatar?: string | null;
  isGuest?: boolean;
  cursor?: { x: number; y: number } | null;
  focusedBlockId?: string | null;
  viewportBlockId?: string | null;
};

export type Collaborator = {
  id: string;
  name: string;
  color: string;
  avatar?: string | null;
  cursor: { x: number; y: number } | null;
  focusedBlockId: string | null;
  viewportBlockId: string | null;
  isGuest: boolean;
};

export type ChatMessage = {
  id: string;
  userId: string;
  name: string;
  text: string;
  color: string;
  createdAt: string;
  isEdited: boolean;
  editedAt: string | null;
  deletedAt: string | null;
  parentId: string | null;
  quotedMessageId: string | null;
};

import {
  isStale,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_PRUNE_INTERVAL_MS,
  shouldSendCursor,
} from "./presence-timing";

const stringToColor = (str: string) => {
  if (str.includes("Hadson")) {
    return "hsl(157, 76%, 35%)";
  }
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${hash % 360}, 60%, 40%)`;
};

export const mapChatMessage = (dto: ChatMessageDTO): ChatMessage => ({
  id: dto.id,
  userId: dto.userId ?? "",
  name: dto.authorName,
  text: dto.content,
  color: stringToColor(dto.authorName || dto.userId || ""),
  createdAt: dto.createdAt,
  isEdited: dto.isEdited,
  editedAt: dto.editedAt,
  deletedAt: dto.deletedAt,
  parentId: dto.parentId,
  quotedMessageId: dto.quotedMessageId,
});

const upsertMessage = (
  list: ChatMessage[],
  msg: ChatMessage,
): ChatMessage[] => {
  const index = list.findIndex((m) => m.id === msg.id);
  if (index === -1) return [...list, msg];
  const next = [...list];
  next[index] = msg;
  return next;
};

export function usePresence(
  pageId: string,
  currentUser: User | null,
  onCapabilitiesChanged?: () => void,
) {
  const onCapabilitiesChangedRef = useRef(onCapabilitiesChanged);
  onCapabilitiesChangedRef.current = onCapabilitiesChanged;

  const [collaborators, setCollaborators] = useState<Map<string, Collaborator>>(
    new Map(),
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const handleRef = useRef<NotebookSocketHandle | null>(null);
  const socketUserIdRef = useRef<string | null>(null);
  const [socketUserId, setSocketUserId] = useState<string | null>(null);
  const lastSeenRef = useRef<Map<string, number>>(new Map());

  const lastSendTime = useRef(0);
  const lastViewportSend = useRef(0);
  const myState = useRef({
    cursor: null as { x: number; y: number } | null,
    focusedBlockId: null as string | null,
    viewportBlockId: null as string | null,
  });

  const presenceMessage = useCallback(
    (myId: string): WsClientMessage => ({
      type: "presence",
      userId: myId,
      name: currentUser?.name || "Visitante",
      avatar: currentUser?.avatarUrl || null,
      isGuest: !currentUser,
      cursor: myState.current.cursor,
      focusedBlockId: myState.current.focusedBlockId,
      viewportBlockId: myState.current.viewportBlockId,
    }),
    [currentUser],
  );

  const broadcastPresence = useCallback(() => {
    const myId = socketUserIdRef.current;
    if (handleRef.current?.isOpen() && myId) {
      handleRef.current.sendText(JSON.stringify(presenceMessage(myId)));
    }
  }, [presenceMessage]);

  const broadcastPresenceWithId = useCallback(
    (myId: string) => {
      if (handleRef.current?.isOpen()) {
        handleRef.current.sendText(JSON.stringify(presenceMessage(myId)));
      }
    },
    [presenceMessage],
  );

  useEffect(() => {
    // presence shares the same socket as sync (messages arrive as text)
    const token = getCookie(tokenCookieName())?.toString() || "";
    const handle = subscribeNotebookSocket(pageId, token, {
      onText: (raw) => {
        const parseResult = catchErrorSync(
          () => JSON.parse(raw) as WsServerMessage,
        );
        if (parseResult.isErr()) {
          console.error("Erro ao ler WebSocket:", parseResult.error);
          return;
        }
        const data = parseResult.data;

        if (data.type === "capabilities_updated") {
          onCapabilitiesChangedRef.current?.();
          return;
        }

        if (data.type === "presence_batch") {
          setCollaborators((prev) => {
            const next = new Map(prev);
            for (const raw of data.updates || []) {
              const u = raw as PresenceUpdate;
              if (!u?.userId || u.userId === socketUserIdRef.current) continue;
              lastSeenRef.current.set(u.userId, Date.now());
              next.set(u.userId, {
                id: u.userId,
                name: u.name || "Visitante",
                color: stringToColor(u.name || u.userId),
                cursor: u.cursor ?? null,
                focusedBlockId: u.focusedBlockId ?? null,
                viewportBlockId: u.viewportBlockId ?? null,
                avatar: u.avatar ?? null,
                isGuest: u.isGuest ?? true,
              });
            }
            for (const goneId of data.gone || []) {
              next.delete(goneId);
              lastSeenRef.current.delete(goneId);
            }
            return next;
          });
          return;
        }

        if (data.type === "init") {
          if (data.userId === socketUserIdRef.current) return;
          socketUserIdRef.current = data.userId;
          setSocketUserId(data.userId);
          broadcastPresenceWithId(data.userId);
          return;
        }

        if (data.type === "chat_message" && data.message) {
          setMessages((prev) =>
            upsertMessage(prev, mapChatMessage(data.message)),
          );
        }
      },
      onClose: () => {
        socketUserIdRef.current = null;
        setSocketUserId(null);
        lastSeenRef.current.clear();
        setCollaborators(new Map());
      },
    });

    handleRef.current = handle;

    const heartbeat = setInterval(() => {
      broadcastPresence();
    }, PRESENCE_HEARTBEAT_MS);

    const prune = setInterval(() => {
      const now = Date.now();
      setCollaborators((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [id, seen] of lastSeenRef.current) {
          if (isStale(now, seen)) {
            next.delete(id);
            lastSeenRef.current.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, PRESENCE_PRUNE_INTERVAL_MS);

    return () => {
      clearInterval(heartbeat);
      clearInterval(prune);
      handle.unsubscribe();
      handleRef.current = null;
      socketUserIdRef.current = null;
      setSocketUserId(null);
      lastSeenRef.current.clear();
    };
  }, [pageId, broadcastPresence, broadcastPresenceWithId]);

  useEffect(() => {
    let cancelled = false;
    fetchNotebookMessages(pageId).then((result) => {
      if (!cancelled && result.isOk()) {
        setMessages(result.data.map(mapChatMessage));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  const sendChatMessage = useCallback(
    (
      text: string,
      parentId?: string | null,
      quotedMessageId?: string | null,
    ) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      // persiste via REST; o servidor difunde o evento chat_message de volta
      // (inclusive para esta aba), e o upsert por id evita duplicar
      sendNotebookMessage(pageId, {
        content: trimmed,
        parentId: parentId ?? null,
        quotedMessageId: quotedMessageId ?? null,
      }).then((result) => {
        if (result.isOk())
          setMessages((prev) =>
            upsertMessage(prev, mapChatMessage(result.data)),
          );
      });
    },
    [pageId],
  );

  const editMessage = useCallback(
    (messageId: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      editNotebookMessage(pageId, messageId, trimmed).then((result) => {
        if (result.isOk())
          setMessages((prev) =>
            upsertMessage(prev, mapChatMessage(result.data)),
          );
      });
    },
    [pageId],
  );

  const deleteMessage = useCallback(
    (messageId: string) => {
      deleteNotebookMessage(pageId, messageId).then((result) => {
        if (result.isOk())
          setMessages((prev) =>
            upsertMessage(prev, mapChatMessage(result.data)),
          );
      });
    },
    [pageId],
  );

  const updateCursor = useCallback(
    (x: number, y: number) => {
      myState.current.cursor = { x, y };
      const now = Date.now();
      if (shouldSendCursor(now, lastSendTime.current)) {
        broadcastPresence();
        lastSendTime.current = now;
      }
    },
    [broadcastPresence],
  );

  const updateFocus = useCallback(
    (blockId: string | null) => {
      myState.current.focusedBlockId = blockId;
      broadcastPresence();
    },
    [broadcastPresence],
  );

  const updateViewport = useCallback(
    (blockId: string | null) => {
      if (myState.current.viewportBlockId === blockId) return;
      myState.current.viewportBlockId = blockId;
      const now = Date.now();
      if (now - lastViewportSend.current > 200) {
        broadcastPresence();
        lastViewportSend.current = now;
      }
    },
    [broadcastPresence],
  );

  return {
    socketUserId,
    collaborators: Array.from(collaborators.values()),
    messages,
    sendChatMessage,
    editMessage,
    deleteMessage,
    updateCursor,
    updateFocus,
    updateViewport,
  };
}

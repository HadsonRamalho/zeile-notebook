import { getCookie } from "cookies-next";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type NotebookSocketHandle,
  subscribeNotebookSocket,
} from "@/lib/notebook-socket";
import type { User } from "@/lib/types/user-types";

export type Collaborator = {
  id: string;
  name: string;
  color: string;
  avatar?: string | null;
  cursor: { x: number; y: number } | null;
  focusedBlockId: string | null;
  isGuest: boolean;
};

export type ChatMessage = {
  id: string;
  userId: string;
  name: string;
  text: string;
  color: string;
};

const CHAT_MESSAGE_LIFETIME_MS = 12000;

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

  const lastSendTime = useRef(0);
  const myState = useRef({
    cursor: null as { x: number; y: number } | null,
    focusedBlockId: null as string | null,
  });

  const broadcastPresence = useCallback(() => {
    const myId = socketUserIdRef.current;
    if (handleRef.current?.isOpen() && myId) {
      handleRef.current.sendText(
        JSON.stringify({
          type: "presence",
          userId: myId,
          name: currentUser?.name || "Visitante",
          avatar: currentUser?.avatar_url || null,
          isGuest: !currentUser,
          cursor: myState.current.cursor,
          focusedBlockId: myState.current.focusedBlockId,
        }),
      );
    }
  }, [currentUser]);

  const broadcastPresenceWithId = useCallback(
    (myId: string) => {
      if (handleRef.current?.isOpen()) {
        handleRef.current.sendText(
          JSON.stringify({
            type: "presence",
            userId: myId,
            name: currentUser?.name || "Visitante",
            avatar: currentUser?.avatar_url || null,
            isGuest: !currentUser,
            cursor: myState.current.cursor,
            focusedBlockId: myState.current.focusedBlockId,
          }),
        );
      }
    },
    [currentUser],
  );

  useEffect(() => {
    // presença divide o mesmo socket do sync (mensagens chegam como texto)
    const token = getCookie("auth_token")?.toString() || "";
    const handle = subscribeNotebookSocket(pageId, token, {
      onText: (raw) => {
        try {
          const data = JSON.parse(raw);

        if (data.type === "capabilities_updated") {
          onCapabilitiesChangedRef.current?.();
          return;
        }

        // o servidor coalesce a presença num batch periódico (updates + gone)
        if (data.type === "presence_batch") {
          setCollaborators((prev) => {
            const next = new Map(prev);
            for (const u of data.updates || []) {
              if (!u?.userId || u.userId === socketUserIdRef.current) continue;
              next.set(u.userId, {
                id: u.userId,
                name: u.name || "Visitante",
                color: stringToColor(u.name || u.userId),
                cursor: u.cursor ?? null,
                focusedBlockId: u.focusedBlockId ?? null,
                avatar: u.avatar ?? null,
                isGuest: u.isGuest ?? true,
              });
            }
            for (const goneId of data.gone || []) {
              next.delete(goneId);
            }
            return next;
          });
          return;
        }

        if (data.userId === socketUserIdRef.current) return;

        if (data.type === "init") {
          socketUserIdRef.current = data.userId;
          setSocketUserId(data.userId);
          broadcastPresenceWithId(data.userId);
          return;
        }

        if (data.type === "chat") {
          const newMsg: ChatMessage = {
            id: data.msgId,
            userId: data.userId,
            name: data.name || "Visitante",
            text: data.text,
            color: stringToColor(data.name || data.userId),
          };

          setMessages((prev) => [...prev, newMsg]);

          setTimeout(() => {
            setMessages((prev) => prev.filter((m) => m.id !== newMsg.id));
          }, CHAT_MESSAGE_LIFETIME_MS);
          return;
        }

        if (data.type === "disconnect") {
          setCollaborators((prev) => {
            const next = new Map(prev);
            next.delete(data.userId);
            return next;
          });
          return;
        }

        if (data.type === "presence") {
          setCollaborators((prev) => {
            const next = new Map(prev);
            next.set(data.userId, {
              id: data.userId,
              name: data.name || "Visitante",
              color: stringToColor(data.name || data.userId),
              cursor: data.cursor,
              focusedBlockId: data.focusedBlockId,
              avatar: data.avatar,
              isGuest: data.isGuest ?? true,
            });
            return next;
          });
        }
        } catch (e) {
          console.error("Erro ao ler WebSocket:", e);
        }
      },
      onClose: () => {
        socketUserIdRef.current = null;
        setSocketUserId(null);
      },
    });

    handleRef.current = handle;

    return () => {
      handle.unsubscribe();
      handleRef.current = null;
      socketUserIdRef.current = null;
      setSocketUserId(null);
    };
  }, [pageId, broadcastPresenceWithId]);

  const sendChatMessage = useCallback(
    (text: string) => {
      const myId = socketUserIdRef.current;
      if (!text.trim() || !myId) return;

      const msgId = crypto.randomUUID();
      const newMsg: ChatMessage = {
        id: msgId,
        userId: myId,
        name: currentUser?.name || "Visitante",
        text,
        color: stringToColor(currentUser?.name || myId),
      };

      setMessages((prev) => [...prev, newMsg]);
      setTimeout(() => {
        setMessages((prev) => prev.filter((m) => m.id !== newMsg.id));
      }, CHAT_MESSAGE_LIFETIME_MS);

      if (handleRef.current?.isOpen()) {
        handleRef.current.sendText(
          JSON.stringify({
            type: "chat",
            msgId,
            userId: myId,
            name: currentUser?.name || "Visitante",
            text,
          }),
        );
      }
    },
    [currentUser],
  );

  const updateCursor = useCallback(
    (x: number, y: number) => {
      myState.current.cursor = { x, y };
      const now = Date.now();
      if (now - lastSendTime.current > 50) {
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

  return {
    socketUserId,
    collaborators: Array.from(collaborators.values()),
    messages,
    sendChatMessage,
    updateCursor,
    updateFocus,
  };
}

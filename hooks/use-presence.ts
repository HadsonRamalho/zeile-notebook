import { getCookie } from "cookies-next";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const wsRef = useRef<WebSocket | null>(null);
  const socketUserIdRef = useRef<string | null>(null);
  const [socketUserId, setSocketUserId] = useState<string | null>(null);

  const lastSendTime = useRef(0);
  const myState = useRef({
    cursor: null as { x: number; y: number } | null,
    focusedBlockId: null as string | null,
  });

  const broadcastPresence = useCallback(() => {
    const myId = socketUserIdRef.current;
    if (wsRef.current?.readyState === WebSocket.OPEN && myId) {
      wsRef.current.send(
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
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
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
    if (wsRef.current) {
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      )
        return;
      wsRef.current.close();
    }

    const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
    const host =
      process.env.NEXT_PUBLIC_WS_URL?.replace(/^https?:\/\//, "") || "";
    const wsUrl = `${protocol}${host}/notebook/ws/presence/${pageId}`;
    const token = getCookie("auth_token")?.toString() || "";
    const protocols = token.length > 0 ? ["access_token", token] : undefined;

    const ws = new WebSocket(wsUrl, protocols);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "capabilities_updated") {
          onCapabilitiesChangedRef.current?.();
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
    };

    ws.onopen = () => {
      // Wait for init message to broadcast
    };

    return () => {
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.close();
      }
      wsRef.current = null;
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

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
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

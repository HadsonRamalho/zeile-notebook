// conexão websocket única por notebook, compartilhada por sync (binário) e presença
// (texto) via endpoint /notebook/ws/combined/:id. reconexão com backoff+jitter aqui.

import { resolve } from "@/lib/runtime/router";

export type NotebookSocketHandlers = {
  onOpen?: () => void;
  onClose?: () => void;
  onBinary?: (data: ArrayBuffer) => void;
  onText?: (data: string) => void;
};

export type NotebookSocketHandle = {
  sendBinary: (data: ArrayBuffer | Uint8Array) => void;
  sendText: (data: string) => void;
  isOpen: () => boolean;
  unsubscribe: () => void;
};

type Conn = {
  socket: WebSocket | null;
  token: string;
  handlers: Set<NotebookSocketHandlers>;
  reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  reconnectAttempt: number;
  disposed: boolean;
};

const conns = new Map<string, Conn>();

function wsUrl(notebookId: string): string {
  const protocol =
    typeof window !== "undefined" && window.location.protocol === "https:"
      ? "wss://"
      : "ws://";
  const host = resolve("sync").wsHost;
  return `${protocol}${host}/notebook/ws/combined/${notebookId}`;
}

function connect(notebookId: string, conn: Conn) {
  if (conn.disposed) return;
  if (
    conn.socket?.readyState === WebSocket.OPEN ||
    conn.socket?.readyState === WebSocket.CONNECTING
  ) {
    return;
  }

  const protocols =
    conn.token.length > 0 ? ["access_token", conn.token] : undefined;
  const socket = new WebSocket(wsUrl(notebookId), protocols);
  socket.binaryType = "arraybuffer";
  conn.socket = socket;

  socket.onopen = () => {
    conn.reconnectAttempt = 0;
    for (const h of conn.handlers) h.onOpen?.();
  };

  socket.onmessage = (event) => {
    if (typeof event.data === "string") {
      for (const h of conn.handlers) h.onText?.(event.data);
    } else if (event.data instanceof ArrayBuffer) {
      for (const h of conn.handlers) h.onBinary?.(event.data);
    }
  };

  socket.onclose = () => {
    for (const h of conn.handlers) h.onClose?.();
    if (conn.disposed) return;
    const expo = Math.min(30000, 1000 * 2 ** conn.reconnectAttempt);
    conn.reconnectAttempt += 1;
    conn.reconnectTimer = setTimeout(
      () => connect(notebookId, conn),
      Math.random() * expo,
    );
  };
}

export function subscribeNotebookSocket(
  notebookId: string,
  token: string,
  handlers: NotebookSocketHandlers,
): NotebookSocketHandle {
  let conn = conns.get(notebookId);
  if (!conn) {
    conn = {
      socket: null,
      token,
      handlers: new Set(),
      reconnectTimer: undefined,
      reconnectAttempt: 0,
      disposed: false,
    };
    conns.set(notebookId, conn);
    connect(notebookId, conn);
  } else {
    conn.token = token || conn.token;
  }
  conn.handlers.add(handlers);

  const activeConn = conn;

  // se já aberto, dispara o onOpen do novo inscrito em microtask (para ele já ter o handle)
  queueMicrotask(() => {
    if (
      !activeConn.disposed &&
      activeConn.socket?.readyState === WebSocket.OPEN &&
      activeConn.handlers.has(handlers)
    ) {
      handlers.onOpen?.();
    }
  });

  return {
    sendBinary: (data) => {
      if (activeConn.socket?.readyState === WebSocket.OPEN) {
        activeConn.socket.send(data);
      }
    },
    sendText: (data) => {
      if (activeConn.socket?.readyState === WebSocket.OPEN) {
        activeConn.socket.send(data);
      }
    },
    isOpen: () => activeConn.socket?.readyState === WebSocket.OPEN,
    unsubscribe: () => {
      activeConn.handlers.delete(handlers);
      if (activeConn.handlers.size === 0) {
        activeConn.disposed = true;
        clearTimeout(activeConn.reconnectTimer);
        if (activeConn.socket) {
          activeConn.socket.onopen = null;
          activeConn.socket.onmessage = null;
          activeConn.socket.onclose = null;
          activeConn.socket.close();
        }
        conns.delete(notebookId);
      }
    },
  };
}

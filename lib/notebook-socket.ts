// single websocket connection per notebook, shared by sync (binary) and presence
// (text) via the /notebook/ws/combined/:id endpoint. Reconnection with backoff+jitter lives here.

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

function wsUrl(notebookId: string): string | null {
  const target = resolve("sync");
  if (!target.wsHost) return null;
  const protocol = target.wsSecure ? "wss://" : "ws://";
  return `${protocol}${target.wsHost}/notebook/ws/combined/${notebookId}`;
}

function scheduleReconnect(notebookId: string, conn: Conn) {
  if (conn.disposed) return;
  const expo = Math.min(30000, 1000 * 2 ** conn.reconnectAttempt);
  conn.reconnectAttempt += 1;
  conn.reconnectTimer = setTimeout(
    () => connect(notebookId, conn),
    Math.random() * expo,
  );
}

function connect(notebookId: string, conn: Conn) {
  if (conn.disposed) return;
  if (
    conn.socket?.readyState === WebSocket.OPEN ||
    conn.socket?.readyState === WebSocket.CONNECTING
  ) {
    return;
  }

  const url = wsUrl(notebookId);
  if (!url) {
    scheduleReconnect(notebookId, conn);
    return;
  }

  const protocols =
    conn.token.length > 0 ? ["access_token", conn.token] : undefined;

  let socket: WebSocket;
  try {
    socket = new WebSocket(url, protocols);
  } catch (err) {
    console.error("Falha ao abrir o WebSocket do caderno:", err);
    conn.socket = null;
    for (const h of conn.handlers) h.onClose?.();
    scheduleReconnect(notebookId, conn);
    return;
  }

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
    scheduleReconnect(notebookId, conn);
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

  // if already open, fire the new subscriber's onOpen in a microtask (so it already has the handle)
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

"use client";

import { Database, History, MessageSquare, RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ExpandableTabs,
  type ExpandableTabsItem,
} from "@/components/motion/expandable-tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AutomergeHistoryEntry } from "@/hooks/use-automerge-sync";
import { useIsTouchDevice } from "@/hooks/use-is-touch-device";
import type { ChatMessage, Collaborator } from "@/hooks/use-presence";
import { fetchNotebookMessageVersions } from "@/lib/api/chat-service";
import { updateAppBadge } from "@/lib/appBadge";
import type { Notebook } from "@/lib/types";
import type { User } from "@/lib/types/user-types";
import { cn } from "@/lib/utils";
import { useCan } from "../permissions/capabilities";
import { MessageVersions } from "./message-versions";

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

function getInitials(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    const first = parts[0]?.[0] || "";
    const last = parts[parts.length - 1]?.[0] || "";
    return `${first}${last}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

type PresenceUser = {
  id: string;
  name: string;
  avatar: string | null;
  isGuest: boolean;
  isMe: boolean;
  color: string;
};

function usePresenceUsers({
  socketUserId,
  collaborators,
  currentUser,
}: Pick<CollabBarProps, "socketUserId" | "collaborators" | "currentUser">) {
  return useMemo<PresenceUser[]>(
    () => [
      {
        id: socketUserId || "me",
        name: currentUser?.name || "Visitante",
        avatar: currentUser?.avatar_url || null,
        isGuest: !currentUser,
        isMe: true,
        color: currentUser?.name
          ? stringToColor(currentUser.name)
          : "hsl(215, 60%, 40%)",
      },
      ...collaborators.map((c) => ({
        id: c.id,
        name: c.name,
        avatar: c.avatar ?? null,
        isGuest: c.isGuest,
        isMe: false,
        color: c.color,
      })),
    ],
    [socketUserId, collaborators, currentUser],
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function splitMentions(text: string, names: string[]) {
  const uniqueNames = Array.from(new Set(names.filter(Boolean))).sort(
    (a, b) => b.length - a.length,
  );
  if (uniqueNames.length === 0) return [{ mention: false, value: text }];

  const pattern = new RegExp(
    `@(${uniqueNames.map(escapeRegExp).join("|")})(?![\\w])`,
    "g",
  );
  const parts: { mention: boolean; value: string }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      parts.push({ mention: false, value: text.slice(lastIndex, match.index) });
    }
    parts.push({ mention: true, value: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ mention: false, value: text.slice(lastIndex) });
  }
  return parts;
}

function MessageText({ text, names }: { text: string; names: string[] }) {
  const parts = useMemo(() => splitMentions(text, names), [text, names]);
  return (
    <span className="wrap-break-word">
      {parts.map((part, index) =>
        part.mention ? (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: partes derivadas do texto não têm identidade estável
            key={index}
            className="rounded bg-white/20 px-1 font-semibold"
          >
            {part.value}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: partes derivadas do texto não têm identidade estável
          <span key={index}>{part.value}</span>
        ),
      )}
    </span>
  );
}

interface CollabBarProps {
  canWriteHistory: boolean;
  /** Histórico Automerge completo já reconstruído (não paginado) — a exibição é fatiada por `automergeHistoryVisibleCount`. */
  automergeHistory: AutomergeHistoryEntry[];
  automergeHistoryVisibleCount: number;
  isLoadingAutomergeHistory: boolean;
  automergeHistoryProgress: { done: number; total: number } | null;
  onLoadAutomergeHistory: () => void;
  onLoadMoreAutomergeHistory: () => void;
  previewDoc: Notebook | null;
  setPreviewDoc: (d: Notebook | null) => void;
  notebookId: string;
  messages: ChatMessage[];
  sendChatMessage: (text: string, parentId?: string | null) => void;
  editMessage: (messageId: string, content: string) => void;
  deleteMessage: (messageId: string) => void;
  socketUserId: string | null;
  collaborators: Collaborator[];
  currentUser: User | null;
}

function HistoryPanel({
  history,
  previewDoc,
  setPreviewDoc,
}: {
  history: AutomergeHistoryEntry[];
} & Pick<CollabBarProps, "previewDoc" | "setPreviewDoc">) {
  return (
    <div
      className={cn(
        "h-[33vh] overflow-y-auto p-1",
        history.length === 0 ? "flex items-center justify-center" : "space-y-2",
      )}
    >
      {history.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          Nenhuma alteração detectada.
        </p>
      ) : (
        history.map((snap, index) => {
          const isSelected = previewDoc === snap.doc;
          return (
            <Button
              key={index}
              onClick={() => setPreviewDoc(snap.doc)}
              className={`w-full justify-start rounded-xl border p-3 text-left text-sm transition-all ${
                isSelected
                  ? "border-primary bg-primary/10 text-primary shadow-sm"
                  : "border-transparent bg-muted/30 hover:border-border hover:bg-muted/60"
              }`}
            >
              <div className="flex items-center gap-1 text-xs">
                <RotateCw className="size-3" />
                {snap.timestamp.toLocaleDateString()}{" "}
                {snap.timestamp.toLocaleTimeString()}
              </div>
            </Button>
          );
        })
      )}
    </div>
  );
}

// Histórico real do Automerge (um snapshot por change já aplicado ao
// documento) — reconstruído em fatias (ver `buildAutomergeHistory`) e
// paginado aqui de 50 em 50 pra não travar a aba nem renderizar milhares de
// linhas de uma vez.
function HistoryTabContent({
  automergeHistory,
  automergeHistoryVisibleCount,
  isLoadingAutomergeHistory,
  automergeHistoryProgress,
  onLoadAutomergeHistory,
  onLoadMoreAutomergeHistory,
  previewDoc,
  setPreviewDoc,
}: Pick<
  CollabBarProps,
  | "automergeHistory"
  | "automergeHistoryVisibleCount"
  | "isLoadingAutomergeHistory"
  | "automergeHistoryProgress"
  | "onLoadAutomergeHistory"
  | "onLoadMoreAutomergeHistory"
  | "previewDoc"
  | "setPreviewDoc"
>) {
  const visibleAutomergeHistory = automergeHistory.slice(
    0,
    automergeHistoryVisibleCount,
  );
  const hasMoreAutomergeHistory =
    automergeHistoryVisibleCount < automergeHistory.length;

  return (
    <div className="w-[min(36rem,90vw)] space-y-2 p-1">
      <button
        type="button"
        onClick={onLoadAutomergeHistory}
        disabled={isLoadingAutomergeHistory}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Database className="size-3" />
        {isLoadingAutomergeHistory
          ? automergeHistoryProgress
            ? `Reconstruindo... ${automergeHistoryProgress.done}/${automergeHistoryProgress.total}`
            : "Reconstruindo..."
          : automergeHistory.length > 0
            ? `Atualizar histórico (${automergeHistory.length} no total)`
            : "Carregar histórico"}
      </button>

      <HistoryPanel
        history={visibleAutomergeHistory}
        previewDoc={previewDoc}
        setPreviewDoc={setPreviewDoc}
      />

      {hasMoreAutomergeHistory && (
        <button
          type="button"
          onClick={onLoadMoreAutomergeHistory}
          className="w-full rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground hover:border-foreground/40 hover:text-foreground"
        >
          Carregar mais 50 ({visibleAutomergeHistory.length}/
          {automergeHistory.length})
        </button>
      )}
    </div>
  );
}

function ChatPanel({
  notebookId,
  messages,
  sendChatMessage,
  editMessage,
  deleteMessage,
  currentUserId,
  allUsers,
}: Pick<
  CollabBarProps,
  | "notebookId"
  | "messages"
  | "sendChatMessage"
  | "editMessage"
  | "deleteMessage"
> & {
  currentUserId: string | null;
  allUsers: PresenceUser[];
}) {
  const [inputValue, setInputValue] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isTouchDevice = useIsTouchDevice();
  const canSend = useCan()("chat.messages.send");

  const topLevel = useMemo(
    () => messages.filter((m) => !m.parentId),
    [messages],
  );
  const repliesByParent = useMemo(() => {
    const map = new Map<string, ChatMessage[]>();
    for (const m of messages) {
      if (!m.parentId) continue;
      const list = map.get(m.parentId) ?? [];
      list.push(m);
      map.set(m.parentId, list);
    }
    return map;
  }, [messages]);

  const submitReply = (parentId: string) => {
    if (replyText.trim()) {
      sendChatMessage(replyText.trim(), parentId);
      setReplyText("");
    }
  };

  const startEdit = (id: string, text: string) => {
    setEditingId(id);
    setEditValue(text);
  };

  const submitEdit = () => {
    if (editingId && editValue.trim()) {
      editMessage(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue("");
  };

  const allNames = useMemo(() => allUsers.map((u) => u.name), [allUsers]);

  useEffect(() => {
    if (isTouchDevice) return;
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, [isTouchDevice]);

  const mentionQuery = /@([^\s@]*)$/.exec(inputValue)?.[1] ?? null;
  const mentionMatches =
    mentionQuery === null
      ? []
      : allUsers.filter((u) =>
          u.name.toLowerCase().includes(mentionQuery.toLowerCase()),
        );

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery]);

  const applyMention = (user: PresenceUser) => {
    setInputValue((current) =>
      current.replace(/@([^\s@]*)$/, `@${user.name} `),
    );
    inputRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mentionMatches.length > 0) return;
    if (inputValue.trim()) {
      sendChatMessage(inputValue.trim());
      setInputValue("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mentionMatches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionIndex((i) => Math.min(mentionMatches.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      applyMention(mentionMatches[mentionIndex]);
    } else if (e.key === "Escape") {
      setInputValue((current) => current.replace(/@([^\s@]*)$/, ""));
    }
  };

  const renderBubble = (msg: ChatMessage) => {
    const isMe = !!currentUserId && msg.userId === currentUserId;
    const isEditing = editingId === msg.id;
    const isDeleted = !!msg.deletedAt;
    return (
      <div
        className={cn(
          "group max-w-[85%] rounded-2xl px-3 py-2 text-sm text-white",
          isMe ? "rounded-tr-none" : "rounded-tl-none",
        )}
        style={{ backgroundColor: msg.color }}
      >
        <span className="mb-0.5 flex items-center gap-2 text-xs font-bold opacity-80">
          <span>{msg.name}</span>
          {isMe && !isEditing && !isDeleted && (
            <span className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => startEdit(msg.id, msg.text)}
                className="hover:underline"
              >
                editar
              </button>
              <button
                type="button"
                onClick={() => deleteMessage(msg.id)}
                className="hover:underline"
              >
                excluir
              </button>
            </span>
          )}
        </span>
        {isDeleted ? (
          <span className="text-sm italic opacity-70">mensagem excluída</span>
        ) : isEditing ? (
          <div className="flex flex-col gap-1.5">
            <input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitEdit();
                } else if (e.key === "Escape") {
                  setEditingId(null);
                }
              }}
              // biome-ignore lint/a11y/noAutofocus: foco imediato ao editar
              autoFocus
              className="rounded-md bg-white/20 px-2 py-1 text-sm text-white outline-none placeholder:text-white/60"
            />
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={submitEdit}
                className="font-semibold hover:underline"
              >
                salvar
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="opacity-80 hover:underline"
              >
                cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            <MessageText text={msg.text} names={allNames} />
            {msg.isEdited && (
              <span className="ml-1 inline-flex items-center gap-1.5 text-[10px] italic opacity-70">
                (editado)
                <MessageVersions
                  load={() => fetchNotebookMessageVersions(notebookId, msg.id)}
                  triggerClassName="not-italic underline hover:opacity-100"
                />
              </span>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex w-[min(36rem,90vw)] flex-col gap-2 p-1">
      <div
        className={cn(
          "flex h-[33vh] flex-col gap-2 overflow-y-auto",
          topLevel.length === 0 && "items-center justify-center",
        )}
      >
        {topLevel.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Nenhuma mensagem ainda.
          </p>
        ) : (
          topLevel.map((msg) => {
            const isMe = !!currentUserId && msg.userId === currentUserId;
            const replies = repliesByParent.get(msg.id) ?? [];
            const isOpen = activeThread === msg.id;
            return (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col gap-1",
                  isMe ? "items-end" : "items-start",
                )}
              >
                {renderBubble(msg)}
                <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
                  {replies.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveThread(isOpen ? null : msg.id)}
                      className="hover:text-foreground"
                    >
                      {replies.length}{" "}
                      {replies.length > 1 ? "respostas" : "resposta"}
                    </button>
                  )}
                  {canSend && (
                    <button
                      type="button"
                      onClick={() => setActiveThread(isOpen ? null : msg.id)}
                      className="hover:text-foreground"
                    >
                      responder
                    </button>
                  )}
                </div>
                {isOpen && (
                  <div className="flex w-full flex-col gap-2 border-l-2 border-border pl-3">
                    {replies.map((reply) => {
                      const replyIsMe =
                        !!currentUserId && reply.userId === currentUserId;
                      return (
                        <div
                          key={reply.id}
                          className={cn(
                            "flex",
                            replyIsMe ? "justify-end" : "justify-start",
                          )}
                        >
                          {renderBubble(reply)}
                        </div>
                      );
                    })}
                    {canSend && (
                      <input
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            submitReply(msg.id);
                          } else if (e.key === "Escape") {
                            setActiveThread(null);
                          }
                        }}
                        placeholder="Responder na thread..."
                        className="h-9 w-full rounded-full border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {!canSend ? (
        <p className="rounded-full border border-border bg-muted/40 px-4 py-2.5 text-center text-xs text-muted-foreground">
          Você não pode enviar mensagens neste chat.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="relative">
          {mentionMatches.length > 0 && (
            <div className="absolute bottom-full mb-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-lg">
              {mentionMatches.map((user, index) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => applyMention(user)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                    index === mentionIndex
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-accent",
                  )}
                >
                  <Avatar size="sm" className="size-5">
                    {user.avatar ? (
                      <AvatarImage src={user.avatar} alt={user.name} />
                    ) : null}
                    <AvatarFallback
                      style={{ backgroundColor: user.color }}
                      className="text-[8px] font-medium text-white"
                    >
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  {user.name}
                </button>
              ))}
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            enterKeyHint="send"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite uma mensagem... use @ para mencionar"
            className="h-10 w-full rounded-full border border-border bg-card px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
          />
        </form>
      )}
    </div>
  );
}

function PresenceStack({
  users,
  pulseUserId,
}: {
  users: PresenceUser[];
  pulseUserId?: string | null;
}) {
  const visible = users.slice(0, 3);
  const overflow = users.length - visible.length;

  return (
    <span className="flex items-center -space-x-2">
      {visible.map((user) => (
        <Avatar
          key={user.id}
          size="sm"
          className={cn(
            "size-5 border-2 border-card",
            user.id === pulseUserId && "animate-presence-pulse",
          )}
        >
          {user.avatar ? (
            <AvatarImage src={user.avatar} alt={user.name} />
          ) : null}
          <AvatarFallback
            style={{ backgroundColor: user.color }}
            className="text-[8px] font-medium text-white"
          >
            {getInitials(user.name)}
          </AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <span className="grid size-5 place-items-center rounded-full border-2 border-card bg-muted text-[8px] font-medium text-muted-foreground">
          +{overflow}
        </span>
      )}
    </span>
  );
}

function PresencePanel({
  allUsers,
  pulseUserId,
}: {
  allUsers: PresenceUser[];
  pulseUserId?: string | null;
}) {
  return (
    <div className="flex h-[33vh] w-[min(36rem,90vw)] flex-col gap-2 overflow-y-auto p-1">
      {allUsers.map((user) => (
        <div
          key={user.id}
          className="flex items-center justify-between gap-3 rounded-lg p-1.5 transition-colors hover:bg-muted/50"
        >
          <div className="flex items-center gap-2">
            <Avatar
              size="sm"
              className={cn(
                user.id === pulseUserId && "animate-presence-pulse",
              )}
            >
              {user.avatar ? (
                <AvatarImage src={user.avatar} alt={user.name} />
              ) : null}
              <AvatarFallback
                style={{ backgroundColor: user.color }}
                className="text-[10px] font-medium text-white"
              >
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="max-w-[120px] truncate text-xs font-semibold text-foreground">
                {user.name}{" "}
                {user.isMe && (
                  <span className="text-[10px] font-normal text-muted-foreground">
                    (Você)
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                {user.isGuest ? "Visitante" : "Membro"}
              </span>
            </div>
          </div>
          <Badge
            variant={user.isGuest ? "outline" : "secondary"}
            className="px-1.5 py-0 text-[9px]"
          >
            {user.isGuest ? "Convidado" : "Autenticado"}
          </Badge>
        </div>
      ))}
    </div>
  );
}

export function CollabBar({
  canWriteHistory,
  automergeHistory,
  automergeHistoryVisibleCount,
  isLoadingAutomergeHistory,
  automergeHistoryProgress,
  onLoadAutomergeHistory,
  onLoadMoreAutomergeHistory,
  previewDoc,
  setPreviewDoc,
  notebookId,
  messages,
  sendChatMessage,
  editMessage,
  deleteMessage,
  socketUserId,
  collaborators,
  currentUser,
  activeTab,
  onActiveTabChange,
}: CollabBarProps & {
  activeTab?: string | null;
  onActiveTabChange?: (id: string | null) => void;
}) {
  const presenceCount = collaborators.length + 1;
  const allUsers = usePresenceUsers({
    socketUserId,
    collaborators,
    currentUser,
  });
  const currentUserName = currentUser?.name || "Visitante";

  const [unreadCount, setUnreadCount] = useState(0);
  const [pulseUserId, setPulseUserId] = useState<string | null>(null);
  const seenMessageIds = useRef(new Set<string>());
  const mentionedMessageIds = useRef(new Set<string>());

  useEffect(() => {
    updateAppBadge(unreadCount);
    return () => updateAppBadge(0);
  }, [unreadCount]);

  useEffect(() => {
    if (activeTab === "chat") {
      for (const msg of messages) seenMessageIds.current.add(msg.id);
      setUnreadCount(0);
      return;
    }

    setUnreadCount(
      messages.filter(
        (msg) =>
          msg.userId !== currentUser?.id && !seenMessageIds.current.has(msg.id),
      ).length,
    );
  }, [messages, activeTab, currentUser?.id]);

  useEffect(() => {
    for (const msg of messages) {
      if (msg.userId === currentUser?.id) continue;
      if (mentionedMessageIds.current.has(msg.id)) continue;
      mentionedMessageIds.current.add(msg.id);

      const mentionsMe = splitMentions(msg.text, [currentUserName]).some(
        (part) => part.mention,
      );
      if (mentionsMe) {
        toast(`${msg.name} mencionou você no chat`, { description: msg.text });
        setPulseUserId(socketUserId);
        setTimeout(() => setPulseUserId(null), 1200);
      }
    }
  }, [messages, socketUserId, currentUserName, currentUser?.id]);

  const canViewChat = useCan()("chat.view");

  const items: ExpandableTabsItem[] = [
    ...(canWriteHistory
      ? [
          {
            id: "history",
            label: `Histórico (${automergeHistory.length})`,
            icon: <History className="size-4" />,
            content: (
              <HistoryTabContent
                automergeHistory={automergeHistory}
                automergeHistoryVisibleCount={automergeHistoryVisibleCount}
                isLoadingAutomergeHistory={isLoadingAutomergeHistory}
                automergeHistoryProgress={automergeHistoryProgress}
                onLoadAutomergeHistory={onLoadAutomergeHistory}
                onLoadMoreAutomergeHistory={onLoadMoreAutomergeHistory}
                previewDoc={previewDoc}
                setPreviewDoc={setPreviewDoc}
              />
            ),
          },
        ]
      : []),
    ...(canViewChat
      ? [
          {
            id: "chat",
            label: unreadCount > 0 ? `Chat (${unreadCount})` : "Chat",
            icon: (
              <span className="relative">
                <MessageSquare className="size-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 grid size-3.5 place-items-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </span>
            ),
            content: (
              <ChatPanel
                notebookId={notebookId}
                messages={messages}
                sendChatMessage={sendChatMessage}
                editMessage={editMessage}
                deleteMessage={deleteMessage}
                currentUserId={currentUser?.id ?? null}
                allUsers={allUsers}
              />
            ),
          },
        ]
      : []),
    {
      id: "presence",
      label: `Presença (${presenceCount})`,
      icon: <PresenceStack users={allUsers} pulseUserId={pulseUserId} />,
      content: <PresencePanel allUsers={allUsers} pulseUserId={pulseUserId} />,
    },
  ];

  return (
    <div className="fixed top-4 right-4 z-overlay-controls print:hidden">
      <ExpandableTabs
        items={items}
        value={activeTab}
        onValueChange={onActiveTabChange}
        classNames={{ root: "bg-card/85 backdrop-blur-lg shadow-lg" }}
      />
    </div>
  );
}

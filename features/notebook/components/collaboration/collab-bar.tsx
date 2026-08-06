"use client";

import { Database, History, MessageSquare, RotateCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChatConversation,
  type ChatPermissions,
  type ConversationMember,
  type ConversationMessage,
} from "@/components/chat/chat-conversation";
import {
  ExpandableTabs,
  type ExpandableTabsItem,
} from "@/components/motion/expandable-tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AutomergeHistoryEntry } from "@/features/notebook/hooks/use-automerge-sync";
import type {
  ChatMessage,
  Collaborator,
} from "@/features/notebook/hooks/use-presence";
import { fetchNotebookMessageVersions } from "@/lib/api/chat-service";
import { updateAppBadge } from "@/lib/app-badge";
import { cn } from "@/lib/utils";
import type { Notebook } from "@/types/notebook-types";
import type { User } from "@/types/user-types";
import { useCan } from "../permissions/capabilities";

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
        avatar: currentUser?.avatarUrl || null,
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

  for (const match of text.matchAll(pattern)) {
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

interface CollabBarProps {
  canWriteHistory: boolean;
  /** Full rebuilt Automerge history (not paginated) — the display is sliced by `automergeHistoryVisibleCount`. */
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
  sendChatMessage: (
    text: string,
    parentId?: string | null,
    quotedMessageId?: string | null,
  ) => void;
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
        history.map((snap) => {
          const isSelected = previewDoc === snap.doc;
          return (
            <Button
              key={snap.timestamp.getTime()}
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

// Real Automerge history (one snapshot per change already applied to the
// document) — rebuilt in slices (see `buildAutomergeHistory`) and paginated
// here 50 at a time so it doesn't freeze the tab or render thousands of
// rows at once.
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
  const can = useCan();
  const canSend = can("chat.messages.send");
  const perms = useMemo<ChatPermissions>(
    () => ({
      reply: can("chat.messages.reply"),
      quote: can("chat.messages.quote"),
      edit: can("chat.messages.edit"),
      delete: can("chat.messages.delete"),
      deleteAny: can("chat.messages.delete_any"),
    }),
    [can],
  );

  const conversationMessages = useMemo<ConversationMessage[]>(
    () =>
      messages.map((m) => ({
        id: m.id,
        userId: m.userId || null,
        name: m.name,
        text: m.text,
        createdAt: m.createdAt,
        isEdited: m.isEdited,
        deletedAt: m.deletedAt,
        parentId: m.parentId,
        quotedMessageId: m.quotedMessageId,
      })),
    [messages],
  );

  const members = useMemo<ConversationMember[]>(
    () => allUsers.map((u) => ({ id: u.id, name: u.name, avatar: u.avatar })),
    [allUsers],
  );

  return (
    <div className="w-[min(36rem,90vw)] p-1">
      <ChatConversation
        variant="floating"
        messages={conversationMessages}
        currentUserId={currentUserId}
        canSend={canSend}
        perms={perms}
        members={members}
        onSend={(text, opts) =>
          sendChatMessage(text, opts?.parentId, opts?.quotedMessageId)
        }
        onEdit={editMessage}
        onDelete={deleteMessage}
        loadVersions={(id) =>
          fetchNotebookMessageVersions(notebookId, id).then((r) => r.unwrap())
        }
        emptyHint="Converse com quem está neste notebook em tempo real."
      />
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

"use client";

import { Database, History, MessageSquare, RotateCw, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ExpandableTabs, type ExpandableTabsItem } from "@/components/motion/expandable-tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { HistorySnapshot } from "@/hooks/use-local-history";
import type { ChatMessage, Collaborator } from "@/hooks/use-presence";
import type { Notebook } from "@/lib/types";
import type { User } from "@/lib/types/user-types";
import { cn } from "@/lib/utils";

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

interface CollabBarProps {
  canWriteHistory: boolean;
  history: HistorySnapshot[];
  /** Histórico Automerge completo já reconstruído (não paginado) — a exibição é fatiada por `automergeHistoryVisibleCount`. */
  automergeHistory: HistorySnapshot[];
  automergeHistoryVisibleCount: number;
  isLoadingAutomergeHistory: boolean;
  automergeHistoryProgress: { done: number; total: number } | null;
  onLoadAutomergeHistory: () => void;
  onLoadMoreAutomergeHistory: () => void;
  previewDoc: Notebook | null;
  setPreviewDoc: (d: Notebook | null) => void;
  messages: ChatMessage[];
  sendChatMessage: (text: string) => void;
  socketUserId: string | null;
  collaborators: Collaborator[];
  currentUser: User | null;
}

function HistoryPanel({
  history,
  previewDoc,
  setPreviewDoc,
}: Pick<CollabBarProps, "history" | "previewDoc" | "setPreviewDoc">) {
  return (
    <div
      className={cn(
        "h-[33vh] overflow-y-auto p-1",
        history.length === 0
          ? "flex items-center justify-center"
          : "space-y-2",
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
                {snap.timestamp.toLocaleDateString()} {snap.timestamp.toLocaleTimeString()}
              </div>
            </Button>
          );
        })
      )}
    </div>
  );
}

// Experimental: alterna entre o histórico de sessão (useLocalHistory, amostra
// a cada 5s, só nesta aba) e o histórico real do Automerge (um snapshot por
// change já aplicado ao documento). A reconstrução do lado do Automerge é
// feita em fatias (ver `buildAutomergeHistory`) e paginada aqui de 50 em 50
// pra não travar a aba nem renderizar milhares de linhas de uma vez.
//
// `source`/`onSourceChange` vêm de fora (de `CollabBar`) em vez de um
// `useState` local: o `ExpandableTabs` renderiza este componente em DOIS
// lugares ao mesmo tempo — uma cópia visível e uma invisível só pra medir a
// altura do painel. Com estado local, cada cópia teria seu próprio `source`
// independente, e a cópia de medição nunca saía de "session" (nunca clicada),
// subestimando a altura real da aba Automerge e cortando o fim da lista/o
// botão "carregar mais". Com o estado vindo de fora, as duas cópias ficam
// sincronizadas e a medição bate com o que é exibido de verdade.
function HistoryTabContent({
  source,
  onSourceChange,
  history,
  automergeHistory,
  automergeHistoryVisibleCount,
  isLoadingAutomergeHistory,
  automergeHistoryProgress,
  onLoadAutomergeHistory,
  onLoadMoreAutomergeHistory,
  previewDoc,
  setPreviewDoc,
}: {
  source: "session" | "automerge";
  onSourceChange: (s: "session" | "automerge") => void;
} & Pick<
  CollabBarProps,
  | "history"
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
      <div className="flex items-center gap-1 rounded-full bg-muted/50 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => onSourceChange("session")}
          className={cn(
            "flex-1 rounded-full px-2 py-1 transition-colors",
            source === "session"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Sessão atual
        </button>
        <button
          type="button"
          onClick={() => onSourceChange("automerge")}
          className={cn(
            "flex-1 rounded-full px-2 py-1 transition-colors",
            source === "automerge"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Automerge
        </button>
      </div>

      {source === "automerge" && (
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
            : `Carregar histórico real (${automergeHistory.length} no total)`}
        </button>
      )}

      <HistoryPanel
        history={source === "session" ? history : visibleAutomergeHistory}
        previewDoc={previewDoc}
        setPreviewDoc={setPreviewDoc}
      />

      {source === "automerge" && hasMoreAutomergeHistory && (
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
  messages,
  sendChatMessage,
  socketUserId,
}: Pick<CollabBarProps, "messages" | "sendChatMessage" | "socketUserId">) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(id);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      sendChatMessage(inputValue.trim());
      setInputValue("");
    }
  };

  return (
    <div className="flex w-[min(36rem,90vw)] flex-col gap-2 p-1">
      <div
        className={cn(
          "flex h-[33vh] flex-col gap-2 overflow-y-auto",
          messages.length === 0 && "items-center justify-center",
        )}
      >
        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Nenhuma mensagem ainda.
          </p>
        ) : (
          messages.map((msg) => {
            const isMe = msg.userId === socketUserId;
            return (
              <div
                key={msg.id}
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm text-white",
                  isMe ? "self-end rounded-tr-none" : "self-start rounded-tl-none",
                )}
                style={{ backgroundColor: msg.color }}
              >
                <span className="mb-0.5 block text-xs font-bold opacity-80">
                  {msg.name}
                </span>
                <span className="wrap-break-word">{msg.text}</span>
              </div>
            );
          })
        )}
      </div>
      <form onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          enterKeyHint="send"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Digite uma mensagem..."
          className="h-10 w-full rounded-full border border-border bg-card px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
        />
      </form>
    </div>
  );
}

function PresencePanel({
  socketUserId,
  collaborators,
  currentUser,
}: Pick<CollabBarProps, "socketUserId" | "collaborators" | "currentUser">) {
  const allUsers = useMemo(() => {
    const list = [
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
        avatar: c.avatar,
        isGuest: c.isGuest,
        isMe: false,
        color: c.color,
      })),
    ];
    return list;
  }, [socketUserId, collaborators, currentUser]);

  return (
    <div className="flex h-[33vh] w-[min(36rem,90vw)] flex-col gap-2 overflow-y-auto p-1">
      {allUsers.map((user) => (
        <div
          key={user.id}
          className="flex items-center justify-between gap-3 rounded-lg p-1.5 transition-colors hover:bg-muted/50"
        >
          <div className="flex items-center gap-2">
            <Avatar size="sm">
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
  history,
  automergeHistory,
  automergeHistoryVisibleCount,
  isLoadingAutomergeHistory,
  automergeHistoryProgress,
  onLoadAutomergeHistory,
  onLoadMoreAutomergeHistory,
  previewDoc,
  setPreviewDoc,
  messages,
  sendChatMessage,
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
  // Vive aqui (não dentro de HistoryTabContent) porque o ExpandableTabs
  // renderiza o conteúdo da aba duas vezes (visível + cópia invisível de
  // medição) — estado local duplicaria e dessincronizaria entre as cópias.
  const [historySource, setHistorySource] = useState<"session" | "automerge">(
    "session",
  );

  const items: ExpandableTabsItem[] = [
    ...(canWriteHistory
      ? [
          {
            id: "history",
            label: `Histórico (${history.length})`,
            icon: <History className="size-4" />,
            content: (
              <HistoryTabContent
                source={historySource}
                onSourceChange={setHistorySource}
                history={history}
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
    {
      id: "chat",
      label: "Chat",
      icon: <MessageSquare className="size-4" />,
      content: (
        <ChatPanel
          messages={messages}
          sendChatMessage={sendChatMessage}
          socketUserId={socketUserId}
        />
      ),
    },
    {
      id: "presence",
      label: `Presença (${presenceCount})`,
      icon: (
        <span className="relative inline-flex">
          <Users className="size-4" />
          <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
            {presenceCount}
          </span>
        </span>
      ),
      content: (
        <PresencePanel
          socketUserId={socketUserId}
          collaborators={collaborators}
          currentUser={currentUser}
        />
      ),
    },
  ];

  return (
    <div className="fixed bottom-6 right-6 z-50 print:hidden">
      <ExpandableTabs
        items={items}
        value={activeTab}
        onValueChange={onActiveTabChange}
      />
    </div>
  );
}

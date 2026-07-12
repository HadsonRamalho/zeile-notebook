"use client";

import { Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { MessageVersions } from "@/components/notebook/collaboration/message-versions";
import {
  type ChatMessageDTO,
  deleteTeamMessage,
  editTeamMessage,
  fetchTeamMessages,
  fetchTeamMessageVersions,
  sendTeamMessage,
} from "@/lib/api/chat-service";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 8000;

function upsert(list: ChatMessageDTO[], msg: ChatMessageDTO): ChatMessageDTO[] {
  const index = list.findIndex((m) => m.id === msg.id);
  if (index === -1) return [...list, msg];
  const next = [...list];
  next[index] = msg;
  return next;
}

export function TeamChat({ teamId }: { teamId: string }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const topLevel = useMemo(
    () => messages.filter((m) => !m.parentId),
    [messages],
  );
  const repliesByParent = useMemo(() => {
    const map = new Map<string, ChatMessageDTO[]>();
    for (const m of messages) {
      if (!m.parentId) continue;
      const list = map.get(m.parentId) ?? [];
      list.push(m);
      map.set(m.parentId, list);
    }
    return map;
  }, [messages]);

  const submitReply = async (parentId: string) => {
    const content = replyText.trim();
    if (!content) return;
    setReplyText("");
    try {
      const dto = await sendTeamMessage(teamId, { content, parentId });
      if (dto) setMessages((prev) => upsert(prev, dto));
    } catch {
      // silencioso
    }
  };

  const submitEdit = async () => {
    const content = editValue.trim();
    const id = editingId;
    setEditingId(null);
    setEditValue("");
    if (!id || !content) return;
    try {
      const dto = await editTeamMessage(teamId, id, content);
      if (dto) setMessages((prev) => upsert(prev, dto));
    } catch {
      // silencioso
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const dto = await deleteTeamMessage(teamId, id);
      if (dto) setMessages((prev) => upsert(prev, dto));
    } catch {
      // silencioso
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchTeamMessages(teamId)
        .then((data) => {
          if (!cancelled && Array.isArray(data)) setMessages(data);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [teamId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: rola ao fim quando chegam mensagens
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || sending) return;
    setSending(true);
    try {
      const dto = await sendTeamMessage(teamId, { content });
      if (dto) setMessages((prev) => upsert(prev, dto));
      setInput("");
    } catch {
      // silencioso: erros de rede/permissão são tratados pelo interceptor
    } finally {
      setSending(false);
    }
  };

  const renderMessage = (msg: ChatMessageDTO) => {
    const isMe = !!user && msg.userId === user.id;
    const isEditing = editingId === msg.id;
    const isDeleted = !!msg.deletedAt;
    return (
      <div className="group flex flex-col">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">{msg.authorName}</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {new Date(msg.createdAt).toLocaleString()}
          </span>
          {msg.isEdited && !isEditing && !isDeleted && (
            <span className="inline-flex items-center gap-1.5 text-[10px] italic text-muted-foreground">
              (editado)
              <MessageVersions
                load={() => fetchTeamMessageVersions(teamId, msg.id)}
                triggerClassName="not-italic underline hover:text-foreground"
              />
            </span>
          )}
          {isMe && !isEditing && !isDeleted && (
            <span className="flex items-center gap-2 text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={() => {
                  setEditingId(msg.id);
                  setEditValue(msg.content);
                }}
                className="hover:text-foreground"
              >
                editar
              </button>
              <button
                type="button"
                onClick={() => handleDelete(msg.id)}
                className="hover:text-foreground"
              >
                excluir
              </button>
            </span>
          )}
        </div>
        {isDeleted ? (
          <p className="text-sm italic text-muted-foreground">
            mensagem excluída
          </p>
        ) : isEditing ? (
          <div className="mt-1 flex flex-col gap-1.5">
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
              className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex gap-2 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={submitEdit}
                className="font-semibold hover:text-foreground"
              >
                salvar
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="hover:text-foreground"
              >
                cancelar
              </button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">
            {msg.content}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div
        ref={scrollRef}
        className={cn(
          "flex h-[50vh] flex-col gap-3 overflow-y-auto",
          topLevel.length === 0 && "items-center justify-center",
        )}
      >
        {topLevel.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
        ) : (
          topLevel.map((msg) => {
            const replies = repliesByParent.get(msg.id) ?? [];
            const isOpen = activeThread === msg.id;
            return (
              <div key={msg.id} className="flex flex-col gap-1">
                {renderMessage(msg)}
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
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
                  <button
                    type="button"
                    onClick={() => setActiveThread(isOpen ? null : msg.id)}
                    className="hover:text-foreground"
                  >
                    responder
                  </button>
                </div>
                {isOpen && (
                  <div className="flex flex-col gap-3 border-l-2 border-border pl-3">
                    {replies.map((reply) => (
                      <div key={reply.id}>{renderMessage(reply)}</div>
                    ))}
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
                      className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escreva uma mensagem..."
          className="h-10 flex-1 rounded-full border border-border bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-50"
          aria-label="Enviar mensagem"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}

"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { MessageVersions } from "@/components/notebook/collaboration/message-versions";
import {
  type ChatMessageDTO,
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
  const scrollRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div
        ref={scrollRef}
        className={cn(
          "flex h-[50vh] flex-col gap-3 overflow-y-auto",
          messages.length === 0 && "items-center justify-center",
        )}
      >
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
        ) : (
          messages.map((msg) => {
            const isMe = !!user && msg.userId === user.id;
            const isEditing = editingId === msg.id;
            return (
              <div key={msg.id} className="group flex flex-col">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{msg.authorName}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {new Date(msg.createdAt).toLocaleString()}
                  </span>
                  {msg.isEdited && !isEditing && (
                    <span className="inline-flex items-center gap-1.5 text-[10px] italic text-muted-foreground">
                      (editado)
                      <MessageVersions
                        load={() => fetchTeamMessageVersions(teamId, msg.id)}
                        triggerClassName="not-italic underline hover:text-foreground"
                      />
                    </span>
                  )}
                  {isMe && !isEditing && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(msg.id);
                        setEditValue(msg.content);
                      }}
                      className="text-[10px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                    >
                      editar
                    </button>
                  )}
                </div>
                {isEditing ? (
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

"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type ChatMessageDTO,
  fetchTeamMessages,
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
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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
          messages.map((msg) => (
            <div key={msg.id} className="flex flex-col">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold">{msg.authorName}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {new Date(msg.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">
                {msg.content}
              </p>
            </div>
          ))
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

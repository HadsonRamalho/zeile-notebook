"use client";

import {
  ChevronDown,
  CornerDownLeft,
  MessagesSquare,
  Pencil,
  Quote,
  Reply,
  SendHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MessageVersions } from "@/components/notebook/collaboration/message-versions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollViewport } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ChatMessageVersionDTO } from "@/lib/api/chat-service";
import { cn } from "@/lib/utils";

export interface ConversationMessage {
  id: string;
  userId: string | null;
  name: string;
  text: string;
  createdAt: string;
  isEdited: boolean;
  deletedAt: string | null;
  parentId: string | null;
  quotedMessageId: string | null;
}

export interface ConversationMember {
  id: string;
  name: string;
  avatar?: string | null;
}

export interface ChatPermissions {
  reply: boolean;
  quote: boolean;
  edit: boolean;
  delete: boolean;
  deleteAny: boolean;
}

const ALL_PERMS: ChatPermissions = {
  reply: true,
  quote: true,
  edit: true,
  delete: true,
  deleteAny: true,
};

interface ChatConversationProps {
  messages: ConversationMessage[];
  currentUserId: string | null;
  canSend: boolean;
  perms?: ChatPermissions;
  members?: ConversationMember[];
  onSend: (
    text: string,
    opts?: { parentId?: string | null; quotedMessageId?: string | null },
  ) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  loadVersions: (id: string) => Promise<ChatMessageVersionDTO[] | undefined>;
  variant?: "floating" | "card";
  emptyHint?: string;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return `${parts[0]![0] ?? ""}${parts.at(-1)![0] ?? ""}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function shortTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function MessageBody({ text, names }: { text: string; names: string[] }) {
  const parts = useMemo(() => {
    const unique = Array.from(new Set(names.filter(Boolean))).sort(
      (a, b) => b.length - a.length,
    );
    if (unique.length === 0) return [{ mention: false, value: text }];
    const pattern = new RegExp(
      `@(${unique.map(escapeRegExp).join("|")})(?![\\w])`,
      "g",
    );
    const out: { mention: boolean; value: string }[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(text))) {
      if (m.index > last)
        out.push({ mention: false, value: text.slice(last, m.index) });
      out.push({ mention: true, value: m[0] });
      last = m.index + m[0].length;
    }
    if (last < text.length)
      out.push({ mention: false, value: text.slice(last) });
    return out;
  }, [text, names]);

  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((part, i) =>
        part.mention ? (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: partes derivadas do texto
            key={i}
            className="rounded bg-primary/15 px-1 font-medium text-primary"
          >
            {part.value}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: partes derivadas do texto
          <span key={i}>{part.value}</span>
        ),
      )}
    </span>
  );
}

function QuoteEmbed({ quoted }: { quoted: ConversationMessage }) {
  return (
    <div className="mt-1 mb-0.5 flex w-full items-start gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-1">
      <Quote className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <span className="text-[11px] font-semibold text-foreground/80">
          {quoted.name}
        </span>
        <p className="line-clamp-2 break-words text-xs text-muted-foreground">
          {quoted.deletedAt ? "mensagem excluída" : quoted.text}
        </p>
      </div>
    </div>
  );
}

export function ChatConversation({
  messages,
  currentUserId,
  canSend,
  perms = ALL_PERMS,
  members = [],
  onSend,
  onEdit,
  onDelete,
  loadVersions,
  variant = "card",
  emptyHint = "Converse com quem está aqui em tempo real.",
}: ChatConversationProps) {
  const reduceMotion = useReducedMotion();
  const viewportRef = useRef<HTMLDivElement>(null);

  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<ConversationMessage | null>(null);
  const [quoting, setQuoting] = useState<ConversationMessage | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const byId = useMemo(() => {
    const map = new Map<string, ConversationMessage>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

  const topLevel = useMemo(
    () => messages.filter((m) => !m.parentId),
    [messages],
  );
  const repliesByParent = useMemo(() => {
    const map = new Map<string, ConversationMessage[]>();
    for (const m of messages) {
      if (!m.parentId) continue;
      const list = map.get(m.parentId) ?? [];
      list.push(m);
      map.set(m.parentId, list);
    }
    return map;
  }, [messages]);

  const mentionNames = useMemo(() => {
    const set = new Set<string>(members.map((m) => m.name));
    for (const m of messages) set.add(m.name);
    return Array.from(set);
  }, [members, messages]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reage à contagem
  useEffect(() => {
    const el = viewportRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length, activeThread]);

  const mentionQuery = /@([^\s@]*)$/.exec(draft)?.[1] ?? null;
  const mentionMatches =
    mentionQuery === null
      ? []
      : members
          .filter((u) =>
            u.name.toLowerCase().includes(mentionQuery.toLowerCase()),
          )
          .slice(0, 6);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reseta ao mudar a busca
  useEffect(() => setMentionIndex(0), [mentionQuery]);

  const applyMention = (name: string) => {
    setDraft((cur) => cur.replace(/@([^\s@]*)$/, `@${name} `));
    inputRef.current?.focus();
  };

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onSend(text, {
      parentId: replyTo?.id ?? null,
      quotedMessageId: quoting?.id ?? null,
    });
    setDraft("");
    setQuoting(null);
    setReplyTo(null);
  };

  const composerKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(mentionMatches.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyMention(mentionMatches[mentionIndex]!.name);
        return;
      }
      if (e.key === "Escape") {
        setDraft((cur) => cur.replace(/@([^\s@]*)$/, ""));
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const startEdit = (m: ConversationMessage) => {
    setEditingId(m.id);
    setEditValue(m.text);
  };
  const commitEdit = () => {
    if (editingId && editValue.trim()) onEdit(editingId, editValue.trim());
    setEditingId(null);
    setEditValue("");
  };

  const rowMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] as const },
      };

  const renderRow = (msg: ConversationMessage, isReply = false) => {
    const isMe = !!currentUserId && msg.userId === currentUserId;
    const isEditing = editingId === msg.id;
    const isDeleted = !!msg.deletedAt;
    const quoted = msg.quotedMessageId ? byId.get(msg.quotedMessageId) : null;

    const canReply = !isReply && canSend && perms.reply;
    const canQuote = canSend && perms.quote;
    const canEditMsg = isMe && perms.edit;
    const canDeleteMsg = (isMe && perms.delete) || (!isMe && perms.deleteAny);
    const hasActions = canReply || canQuote || canEditMsg || canDeleteMsg;

    return (
      <div className="group/msg relative flex gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40">
        <Avatar
          className={cn(
            "mt-0.5 shrink-0 ring-1",
            isReply ? "size-6" : "size-7",
            isMe
              ? "bg-primary/15 text-primary ring-primary/30"
              : "bg-muted text-foreground/70 ring-border",
          )}
        >
          <AvatarFallback className="bg-transparent text-[10px] font-semibold">
            {initials(msg.name)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[13px] font-semibold text-foreground">
              {msg.name}
            </span>
            <time
              dateTime={msg.createdAt}
              title={new Date(msg.createdAt).toLocaleString()}
              className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
            >
              {shortTime(msg.createdAt)}
            </time>
            {msg.isEdited && !isDeleted && (
              <span className="flex shrink-0 items-center gap-1 text-[10px] italic text-muted-foreground">
                editado
                <MessageVersions load={() => loadVersions(msg.id)} />
              </span>
            )}
          </div>

          {quoted && !isDeleted && <QuoteEmbed quoted={quoted} />}

          {isDeleted ? (
            <p className="text-sm italic text-muted-foreground">
              mensagem excluída
            </p>
          ) : isEditing ? (
            <div className="mt-1 flex flex-col gap-1.5">
              <Textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    commitEdit();
                  } else if (e.key === "Escape") {
                    setEditingId(null);
                  }
                }}
                // biome-ignore lint/a11y/noAutofocus: foco imediato ao editar
                autoFocus
                rows={1}
                className="min-h-9 resize-none bg-background text-sm"
              />
              <div className="flex items-center gap-1.5">
                <Button size="xs" onClick={commitEdit}>
                  Salvar
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setEditingId(null)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-foreground/90">
              <MessageBody text={msg.text} names={mentionNames} />
            </p>
          )}
        </div>

        {!isEditing && !isDeleted && hasActions && (
          <div className="pointer-events-none absolute top-1 right-1 flex items-center gap-0.5 rounded-lg border border-border/70 bg-popover/85 p-0.5 opacity-0 shadow-sm backdrop-blur-md transition-opacity group-hover/msg:pointer-events-auto group-hover/msg:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100">
            {canReply && (
              <ActionButton
                label="Responder"
                onClick={() => {
                  setActiveThread(msg.id);
                  setReplyTo(msg);
                  setQuoting(null);
                  inputRef.current?.focus();
                }}
              >
                <Reply className="size-3.5" />
              </ActionButton>
            )}
            {canQuote && (
              <ActionButton
                label="Citar"
                onClick={() => {
                  setQuoting(msg);
                  setReplyTo(null);
                  inputRef.current?.focus();
                }}
              >
                <Quote className="size-3.5" />
              </ActionButton>
            )}
            {canEditMsg && (
              <ActionButton label="Editar" onClick={() => startEdit(msg)}>
                <Pencil className="size-3.5" />
              </ActionButton>
            )}
            {canDeleteMsg && (
              <ActionButton
                label="Excluir"
                destructive
                onClick={() => onDelete(msg.id)}
              >
                <Trash2 className="size-3.5" />
              </ActionButton>
            )}
          </div>
        )}
      </div>
    );
  };

  const isFloating = variant === "floating";

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "flex w-full flex-col gap-2",
          isFloating && "h-[60vh] max-h-[calc(100dvh-8rem)] min-h-0",
        )}
      >
        <ScrollArea
          className={cn(
            "w-full rounded-lg",
            isFloating ? "min-h-0 flex-1" : "h-[52vh]",
          )}
        >
          <ScrollViewport ref={viewportRef} className="px-0.5 py-1">
            {topLevel.length === 0 ? (
              <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
                  <MessagesSquare className="size-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    Comece a conversa
                  </p>
                  <p className="max-w-[36ch] text-xs text-muted-foreground">
                    {emptyHint}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                <AnimatePresence initial={false}>
                  {topLevel.map((msg) => {
                    const replies = repliesByParent.get(msg.id) ?? [];
                    const isOpen = activeThread === msg.id;
                    return (
                      <motion.div
                        key={msg.id}
                        layout={!reduceMotion}
                        {...rowMotion}
                      >
                        {renderRow(msg)}

                        {(replies.length > 0 || (canSend && isOpen)) && (
                          <div className="mt-0.5 ml-[1.9rem] flex flex-col gap-1 border-l border-border/70 pl-3">
                            {replies.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setActiveThread(isOpen ? null : msg.id)
                                }
                                className="flex w-fit items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-primary transition-colors hover:bg-primary/10"
                              >
                                <ChevronDown
                                  className={cn(
                                    "size-3 transition-transform",
                                    isOpen && "rotate-180",
                                  )}
                                />
                                {replies.length}{" "}
                                {replies.length > 1 ? "respostas" : "resposta"}
                              </button>
                            )}
                            <AnimatePresence initial={false}>
                              {isOpen && (
                                <motion.div
                                  initial={
                                    reduceMotion
                                      ? undefined
                                      : { height: 0, opacity: 0 }
                                  }
                                  animate={
                                    reduceMotion
                                      ? undefined
                                      : { height: "auto", opacity: 1 }
                                  }
                                  exit={
                                    reduceMotion
                                      ? undefined
                                      : { height: 0, opacity: 0 }
                                  }
                                  transition={{
                                    duration: 0.2,
                                    ease: [0.22, 1, 0.36, 1],
                                  }}
                                  className="overflow-hidden"
                                >
                                  <div className="flex flex-col gap-0.5 pt-0.5">
                                    {replies.map((reply) => (
                                      <div key={reply.id}>
                                        {renderRow(reply, true)}
                                      </div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </ScrollViewport>
        </ScrollArea>

        <div className="shrink-0">
          {canSend ? (
            <Composer
              draft={draft}
              setDraft={setDraft}
              inputRef={inputRef}
              onKeyDown={composerKeyDown}
              onSubmit={submit}
              reduceMotion={!!reduceMotion}
              mentionMatches={mentionMatches}
              mentionIndex={mentionIndex}
              applyMention={applyMention}
              replyTo={replyTo}
              quoting={quoting}
              clearReply={() => setReplyTo(null)}
              clearQuote={() => setQuoting(null)}
            />
          ) : (
            <p className="rounded-lg border border-border/70 bg-muted/40 px-4 py-2.5 text-center text-xs text-muted-foreground">
              Você não pode enviar mensagens neste chat.
            </p>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function ActionButton({
  label,
  children,
  onClick,
  destructive,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn(
            "grid size-6 place-items-center rounded-md text-muted-foreground transition-colors",
            destructive
              ? "hover:bg-destructive/10 hover:text-destructive"
              : "hover:bg-accent hover:text-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent className="z-[210]">{label}</TooltipContent>
    </Tooltip>
  );
}

function Composer({
  draft,
  setDraft,
  inputRef,
  onKeyDown,
  onSubmit,
  reduceMotion,
  mentionMatches,
  mentionIndex,
  applyMention,
  replyTo,
  quoting,
  clearReply,
  clearQuote,
}: {
  draft: string;
  setDraft: (v: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  reduceMotion: boolean;
  mentionMatches: ConversationMember[];
  mentionIndex: number;
  applyMention: (name: string) => void;
  replyTo: ConversationMessage | null;
  quoting: ConversationMessage | null;
  clearReply: () => void;
  clearQuote: () => void;
}) {
  const context = replyTo
    ? {
        icon: <Reply className="size-3" />,
        label: "Respondendo a",
        target: replyTo,
        clear: clearReply,
      }
    : quoting
      ? {
          icon: <Quote className="size-3" />,
          label: "Citando",
          target: quoting,
          clear: clearQuote,
        }
      : null;

  const chipMotion = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 4, height: 0 },
        animate: { opacity: 1, y: 0, height: "auto" },
        exit: { opacity: 0, y: 4, height: 0 },
        transition: { duration: 0.16, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <div className="relative">
      {mentionMatches.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1.5 w-full overflow-hidden rounded-xl border border-border/70 bg-popover/85 shadow-lg backdrop-blur-xl">
          {mentionMatches.map((user, index) => (
            <button
              key={user.id}
              type="button"
              onClick={() => applyMention(user.name)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
                index === mentionIndex
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-accent",
              )}
            >
              <Avatar className="size-5 bg-muted text-[8px]">
                {user.avatar ? (
                  <AvatarImage src={user.avatar} alt={user.name} />
                ) : null}
                <AvatarFallback className="bg-transparent text-[8px] font-semibold">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              {user.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-sm transition-colors focus-within:border-primary/60">
        <AnimatePresence initial={false}>
          {context && (
            <motion.div {...chipMotion} className="overflow-hidden">
              <div className="mx-1 mt-0.5 flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-2.5 py-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 text-primary">{context.icon}</span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                    {context.label}
                  </span>
                  <span className="truncate text-xs text-foreground/80">
                    {context.target.deletedAt
                      ? "mensagem excluída"
                      : context.target.text}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Cancelar"
                  onClick={context.clear}
                  className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-1.5">
          <Textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Mensagem — @ para mencionar"
            className="max-h-32 min-h-9 resize-none border-0 bg-transparent px-2 py-1.5 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                onClick={onSubmit}
                disabled={!draft.trim()}
                className="mb-0.5 shrink-0 rounded-xl"
                aria-label="Enviar mensagem"
              >
                <SendHorizontal className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="z-[210] flex items-center gap-1.5">
              Enviar
              <kbd className="inline-flex items-center gap-0.5 rounded bg-background/20 px-1 font-mono text-[9px]">
                <CornerDownLeft className="size-2.5" />
              </kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

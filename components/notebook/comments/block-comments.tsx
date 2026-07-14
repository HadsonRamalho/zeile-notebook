"use client";

import { Check, MessageSquare, RotateCcw, Send, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { CommentThread } from "@/lib/types/comment-types";
import { cn } from "@/lib/utils";
import { useCommentsContext } from "./comments-context";

function timeLabel(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ThreadView({
  thread,
  canComment,
  currentUserId,
  onReply,
  onResolve,
  onRemove,
}: {
  thread: CommentThread;
  canComment: boolean;
  currentUserId?: string;
  onReply: (body: string) => void;
  onResolve: (status: "open" | "resolved") => void;
  onRemove: (commentId: string) => void;
}) {
  const t = useTranslations("comments");
  const [reply, setReply] = useState("");

  const submitReply = () => {
    const body = reply.trim();
    if (!body) return;
    onReply(body);
    setReply("");
  };

  return (
    <div className="flex flex-col gap-2 border-b border-border/60 pb-3 last:border-b-0">
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-widest",
            thread.status === "resolved"
              ? "text-primary"
              : "text-muted-foreground",
          )}
        >
          {thread.status === "resolved" ? t("resolved") : t("open")}
        </span>
        {canComment && (
          <button
            type="button"
            onClick={() =>
              onResolve(thread.status === "resolved" ? "open" : "resolved")
            }
            title={thread.status === "resolved" ? t("reopen") : t("resolve")}
            className="text-muted-foreground transition-colors hover:text-primary"
          >
            {thread.status === "resolved" ? (
              <RotateCcw className="size-3.5" />
            ) : (
              <Check className="size-3.5" />
            )}
          </button>
        )}
      </div>

      {thread.comments.map((comment) => (
        <div key={comment.id} className="group/comment flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-foreground">
              {comment.authorName}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {timeLabel(comment.createdAt)}
            </span>
            {canComment &&
              comment.authorId === currentUserId &&
              !comment.deletedAt && (
                <button
                  type="button"
                  onClick={() => onRemove(comment.id)}
                  title={t("delete")}
                  className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/comment:opacity-100"
                >
                  <Trash2 className="size-3" />
                </button>
              )}
          </div>
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">
            {comment.deletedAt ? (
              <span className="italic text-muted-foreground">
                {t("deleted")}
              </span>
            ) : (
              comment.body
            )}
          </p>
        </div>
      ))}

      {canComment && (
        <div className="flex items-end gap-1.5">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submitReply();
              }
            }}
            rows={1}
            placeholder={t("reply_placeholder")}
            className="flex-1 resize-none rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={submitReply}
            aria-label={t("send")}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:text-primary"
          >
            <Send className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export function BlockComments({ blockId }: { blockId: string }) {
  const ctx = useCommentsContext();
  const t = useTranslations("comments");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  if (!ctx) return null;

  const threads = ctx.threadsByBlock.get(blockId) ?? [];
  const openCount = threads.filter((th) => th.status === "open").length;
  const hasThreads = threads.length > 0;

  if (!ctx.canComment && !hasThreads) return null;

  const submitNew = () => {
    const body = draft.trim();
    if (!body) return;
    ctx.createThread(blockId, body);
    setDraft("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("comments")}
          className={cn(
            "flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground transition-all",
            "opacity-0 hover:bg-accent hover:text-foreground group-hover/block:opacity-100 md:opacity-0",
            hasThreads && "opacity-100",
            openCount > 0 && "text-primary",
          )}
        >
          <MessageSquare className="size-4" />
          {hasThreads && (
            <span className="font-mono text-[10px]">{threads.length}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="left"
        className="flex max-h-[60vh] w-80 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-md"
      >
        <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {t("comments")}
        </span>

        {threads.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}

        {threads.map((thread) => (
          <ThreadView
            key={thread.id}
            thread={thread}
            canComment={ctx.canComment}
            currentUserId={ctx.currentUserId}
            onReply={(body) => ctx.reply(thread.id, body)}
            onResolve={(status) => ctx.setStatus(thread.id, status)}
            onRemove={(commentId) => ctx.remove(commentId)}
          />
        ))}

        {ctx.canComment && (
          <div className="flex flex-col gap-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submitNew();
                }
              }}
              rows={2}
              placeholder={t("new_placeholder")}
              className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            />
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {t("mention_hint")}
              </span>
              <button
                type="button"
                onClick={submitNew}
                className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                <Send className="size-3.5" />
                {t("comment")}
              </button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

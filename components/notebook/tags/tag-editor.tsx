"use client";

import { Tag, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { MAX_TAG_LEN, MAX_TAGS } from "@/lib/api/folders-service";
import { cn } from "@/lib/utils";

export function TagList({
  tags,
  className,
}: {
  tags: string[];
  className?: string;
}) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="font-normal">
          {tag}
        </Badge>
      ))}
    </div>
  );
}

function normalize(tags: string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_TAG_LEN) continue;
    if (!out.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      out.push(trimmed);
    }
  }
  return out.slice(0, MAX_TAGS);
}

export function TagEditor({
  tags,
  onSave,
  triggerClassName,
  label = "Editar tags",
}: {
  tags: string[];
  onSave: (tags: string[]) => Promise<void> | void;
  triggerClassName?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(tags);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  const full = draft.length >= MAX_TAGS;

  const commitInput = () => {
    const next = normalize([...draft, input]);
    setDraft(next);
    setInput("");
  };

  const removeTag = (tag: string) => {
    setDraft((prev) => prev.filter((t) => t !== tag));
  };

  const save = async (nextOpen: boolean) => {
    if (!nextOpen) {
      const finalTags = normalize(input ? [...draft, input] : draft);
      const changed =
        finalTags.length !== tags.length ||
        finalTags.some((t, i) => t !== tags[i]);
      if (changed) {
        try {
          setSaving(true);
          await onSave(finalTags);
        } finally {
          setSaving(false);
        }
      }
      setInput("");
    }
    setOpen(nextOpen);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        if (v) setDraft(tags);
        save(v);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn(
            "grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:text-foreground",
            triggerClassName,
          )}
        >
          <Tag className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">Tags</span>
          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
            {draft.length}/{MAX_TAGS}
          </span>
        </div>
        {draft.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {draft.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1 pr-1">
                <span className="truncate">{tag}</span>
                <button
                  type="button"
                  aria-label={`Remover ${tag}`}
                  onClick={() => removeTag(tag)}
                  className="grid size-3.5 place-items-center rounded-full hover:bg-background/60"
                >
                  <X className="size-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhuma tag ainda.</p>
        )}
        <input
          value={input}
          disabled={full || saving}
          maxLength={MAX_TAG_LEN}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitInput();
            } else if (
              e.key === "Backspace" &&
              !input &&
              draft.length > 0
            ) {
              removeTag(draft[draft.length - 1]);
            }
          }}
          placeholder={full ? "Limite atingido" : "Adicionar tag e Enter"}
          className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        />
      </PopoverContent>
    </Popover>
  );
}

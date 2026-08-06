"use client";

import { Camera, Globe, History, MessageSquare, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { listActivity } from "@/lib/api/activity-service";
import { readStorage, writeStorage } from "@/lib/safe-storage";
import { cn } from "@/lib/utils";
import type { Activity } from "@/types/activity-types";

const KIND_ICON: Record<string, typeof Pencil> = {
  edit: Pencil,
  comment: MessageSquare,
  snapshot: Camera,
  publish: Globe,
};

const KIND_LABEL_KEYS: Record<string, string> = {
  edit: "kind_edit",
  comment: "kind_comment",
  snapshot: "kind_snapshot",
  publish: "kind_publish",
};

function seenKey(notebookId: string) {
  return `zeile-activity-seen-${notebookId}`;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActivityFeed({ notebookId }: { notebookId: string }) {
  const t = useTranslations("activity");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Activity[]>([]);
  const [lastSeen, setLastSeen] = useState<number>(0);

  const load = useCallback(() => {
    listActivity(notebookId).then((result) => {
      if (result.isOk()) setItems(result.data ?? []);
    });
  }, [notebookId]);

  useEffect(() => {
    const raw = readStorage(seenKey(notebookId));
    setLastSeen(raw ? Number(raw) : 0);
    load();
  }, [notebookId, load]);

  const unseen = items.filter(
    (a) => new Date(a.createdAt).getTime() > lastSeen,
  ).length;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      load();
    } else {
      const now = Date.now();
      writeStorage(seenKey(notebookId), String(now));
      setLastSeen(now);
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("title")}
          className="relative flex items-center justify-center rounded-full border border-border bg-card/85 p-2 text-muted-foreground shadow-lg backdrop-blur-md transition-colors hover:text-foreground"
        >
          <History className="size-4" />
          {unseen > 0 && (
            <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[9px] font-medium text-primary-foreground">
              {unseen > 9 ? "9+" : unseen}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="flex max-h-[60vh] w-72 flex-col gap-1 overflow-y-auto rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-md"
      >
        <span className="mb-1 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {t("title")}
        </span>

        {items.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        )}

        {items.map((item, index) => {
          const Icon = KIND_ICON[item.kind] ?? Pencil;
          const isNew = new Date(item.createdAt).getTime() > lastSeen;
          const prevNew =
            index > 0 &&
            new Date(items[index - 1]!.createdAt).getTime() > lastSeen;
          const showDivider = index === 0 && isNew;
          const showSeenDivider = !isNew && (index === 0 || prevNew);
          return (
            <div key={item.id}>
              {showDivider && (
                <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-primary">
                  {t("since_last_visit")}
                </div>
              )}
              {showSeenDivider && index > 0 && (
                <div className="mb-1 mt-1 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  {t("earlier")}
                </div>
              )}
              <div
                className={cn(
                  "flex items-start gap-2 rounded-md px-1.5 py-1.5",
                  isNew && "bg-primary/5",
                )}
              >
                <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="flex flex-1 flex-col">
                  <span className="text-xs text-foreground">
                    <span className="font-medium">{item.actorName}</span>{" "}
                    {t(KIND_LABEL_KEYS[item.kind] ?? "kind_edit")}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {timeLabel(item.createdAt)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

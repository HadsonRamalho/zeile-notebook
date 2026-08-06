"use client";

import { Bookmark, Check, RotateCcw, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  createSnapshot,
  deleteSnapshot,
  listSnapshots,
  restoreSnapshot,
} from "@/lib/api/snapshots-service";
import { cn } from "@/lib/utils";
import type { SnapshotMeta } from "@/types/snapshot-types";

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SnapshotsPanel({ notebookId }: { notebookId: string }) {
  const t = useTranslations("snapshots");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SnapshotMeta[]>([]);
  const [label, setLabel] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const load = useCallback(() => {
    listSnapshots(notebookId).then((result) => {
      if (result.isOk()) setItems(result.data ?? []);
    });
  }, [notebookId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const save = async () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    await createSnapshot(notebookId, trimmed);
    setLabel("");
    load();
  };

  const restore = async (id: string) => {
    setConfirmingId(null);
    await restoreSnapshot(notebookId, id);
  };

  const remove = async (id: string) => {
    await deleteSnapshot(notebookId, id);
    load();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={t("title")}
          className="flex items-center justify-center rounded-full border border-border bg-card/85 p-2 text-muted-foreground shadow-lg backdrop-blur-md transition-colors hover:text-foreground"
        >
          <Bookmark className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        className="flex max-h-[60vh] w-80 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-md"
      >
        <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {t("title")}
        </span>

        <div className="flex items-center gap-1.5">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
            placeholder={t("label_placeholder")}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={save}
            className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t("save")}
          </button>
        </div>

        {items.length === 0 && (
          <p className="py-2 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        )}

        {items.map((snapshot) => (
          <div
            key={snapshot.id}
            className="flex flex-col gap-1.5 rounded-lg border border-border/60 p-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                {snapshot.label}
              </span>
              {snapshot.kind !== "manual" && (
                <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  {t("auto")}
                </span>
              )}
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">
              {timeLabel(snapshot.createdAt)}
            </span>
            <div className="flex items-center gap-1.5">
              {confirmingId === snapshot.id ? (
                <>
                  <button
                    type="button"
                    onClick={() => restore(snapshot.id)}
                    className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground"
                  >
                    <Check className="size-3.5" />
                    {t("confirm_restore")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingId(null)}
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingId(snapshot.id)}
                  className={cn(
                    "flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  )}
                >
                  <RotateCcw className="size-3.5" />
                  {t("restore")}
                </button>
              )}
              <button
                type="button"
                onClick={() => remove(snapshot.id)}
                title={t("delete")}
                className="ml-auto rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}

"use client";

import {
  Bell,
  CheckCheck,
  Megaphone,
  MessagesSquare,
  Settings2,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { BackButton } from "@/components/interface/back-button";
import { NotificationPreferences } from "@/components/interface/notifications/notification-preferences";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/use-notifications";
import type { NotificationDTO } from "@/lib/api/notifications-service";
import { cn } from "@/lib/utils";

function iconFor(kind: string) {
  if (kind.startsWith("chat")) return MessagesSquare;
  if (kind === "admin" || kind === "platform") return Megaphone;
  return Bell;
}

function timeAgo(iso: string, t: (key: string) => string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return t("time_now");
  if (min < 60) return `${min}${t("time_minutes")}`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}${t("time_hours")}`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}${t("time_days")}`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationsPage() {
  const t = useTranslations("notifications");
  const router = useRouter();
  const [showPrefs, setShowPrefs] = useState(false);
  const { items, unreadCount, loading, markRead, markAllRead, remove } =
    useNotifications();

  const open = (n: NotificationDTO) => {
    if (!n.readAt) markRead(n.id);
    if (n.url) router.push(n.url);
  };

  return (
    <div className="relative mx-auto w-full max-w-2xl space-y-6 p-4 pt-10 md:p-8">
      <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight">
            <Bell className="size-6 text-primary" />
            {t("title")}
            {unreadCount > 0 && (
              <span className="grid min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
                {unreadCount}
              </span>
            )}
          </h1>
          <BackButton />
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead}>
              <CheckCheck className="size-4" />
              {t("mark_all_read")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-pressed={showPrefs}
            aria-label={t("preferences_aria")}
            onClick={() => setShowPrefs((v) => !v)}
            className={cn(showPrefs && "bg-accent text-foreground")}
          >
            <Settings2 className="size-4" />
          </Button>
        </div>
      </div>

      {showPrefs && <NotificationPreferences />}

      {loading ? (
        <div className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-xl bg-muted/50"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Bell className="size-6" />
          </div>
          <h3 className="text-lg font-semibold">{t("empty_title")}</h3>
          <p className="max-w-xs text-sm text-muted-foreground">
            {t("empty_description")}
          </p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((n) => {
            const Icon = iconFor(n.kind);
            const unread = !n.readAt;
            return (
              <li key={n.id}>
                <div
                  className={cn(
                    "group flex items-start gap-3 rounded-xl border p-3 transition-colors",
                    unread
                      ? "border-primary/30 bg-primary/[0.04]"
                      : "border-border bg-card hover:bg-muted/40",
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 grid size-9 shrink-0 place-items-center rounded-full",
                      unread
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </div>

                  <button
                    type="button"
                    onClick={() => open(n)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-foreground">
                        {n.title}
                      </span>
                      {unread && (
                        <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                      )}
                      <time
                        className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground"
                        dateTime={n.createdAt}
                        title={new Date(n.createdAt).toLocaleString()}
                      >
                        {timeAgo(n.createdAt, t)}
                      </time>
                    </div>
                    <p className="mt-0.5 line-clamp-2 break-words text-sm text-muted-foreground">
                      {n.body}
                    </p>
                  </button>

                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
                    {unread && (
                      <button
                        type="button"
                        aria-label={t("mark_read_aria")}
                        onClick={() => markRead(n.id)}
                        className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <CheckCheck className="size-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={t("remove_aria")}
                      onClick={() => remove(n.id)}
                      className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

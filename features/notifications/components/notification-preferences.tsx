"use client";

import { BellRing, Inbox, MessagesSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  fetchNotificationPreferences,
  saveNotificationPreference,
} from "@/lib/api/notifications-service";

interface Prefs {
  pushEnabled: boolean;
  inappEnabled: boolean;
  chatEnabled: boolean;
}

const DEFAULTS: Prefs = {
  pushEnabled: true,
  inappEnabled: true,
  chatEnabled: true,
};

export function NotificationPreferences() {
  const t = useTranslations("notifications.preferences");
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  const rows: {
    key: keyof Prefs;
    label: string;
    hint: string;
    icon: typeof BellRing;
  }[] = [
    {
      key: "inappEnabled",
      label: t("inapp_label"),
      hint: t("inapp_hint"),
      icon: Inbox,
    },
    {
      key: "pushEnabled",
      label: t("push_label"),
      hint: t("push_hint"),
      icon: BellRing,
    },
    {
      key: "chatEnabled",
      label: t("chat_label"),
      hint: t("chat_hint"),
      icon: MessagesSquare,
    },
  ];

  useEffect(() => {
    fetchNotificationPreferences()
      .then((result) => {
        const global = result.isOk()
          ? result.data.find((r) => r.scopeKind === "global")
          : undefined;
        if (global) {
          setPrefs({
            pushEnabled: global.pushEnabled,
            inappEnabled: global.inappEnabled,
            chatEnabled: global.chatEnabled,
          });
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  const update = (key: keyof Prefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    saveNotificationPreference({ scopeKind: "global", ...next });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-1 text-sm font-semibold">{t("title")}</h2>
      <p className="mb-4 text-xs text-muted-foreground">{t("description")}</p>
      <div className="divide-y divide-border">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-3 py-3">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <row.icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{row.label}</p>
              <p className="text-xs text-muted-foreground">{row.hint}</p>
            </div>
            <Switch
              checked={prefs[row.key]}
              disabled={!loaded}
              onCheckedChange={(v) => update(row.key, v)}
              aria-label={row.label}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

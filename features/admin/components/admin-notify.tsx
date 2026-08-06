"use client";

import { Book, Check, Loader2, Search, Send, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  type AdminSearchKind,
  type AdminSearchResult,
  adminNotify,
  adminSearch,
} from "@/lib/api/admin-service";
import { cn } from "@/lib/utils";

const TARGET_KIND: Record<AdminSearchKind, "user" | "team" | "notebook"> = {
  users: "user",
  teams: "team",
  notebooks: "notebook",
};

export function AdminNotify() {
  const t = useTranslations("admin_notify");
  const KINDS: { value: AdminSearchKind; label: string; icon: typeof Users }[] =
    [
      { value: "users", label: t("kind_users"), icon: Users },
      { value: "teams", label: t("kind_teams"), icon: Users },
      { value: "notebooks", label: t("kind_notebooks"), icon: Book },
    ];
  const [kind, setKind] = useState<AdminSearchKind>("users");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<AdminSearchResult | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [sending, setSending] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(() => {
      adminSearch(kind, q)
        .then((result) => setResults(result.isOk() ? (result.data ?? []) : []))
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, kind]);

  const send = async () => {
    if (!selected || !title.trim() || !body.trim() || sending) return;
    setSending(true);
    const result = await adminNotify({
      targetKind: TARGET_KIND[kind],
      targetId: selected.id,
      title: title.trim(),
      body: body.trim(),
      url: url.trim() || undefined,
    });
    if (result.isErr()) {
      toast.error(t("sent_error"));
    } else {
      toast.success(t("sent_success"));
      setTitle("");
      setBody("");
      setUrl("");
      setSelected(null);
      setQuery("");
    }
    setSending(false);
  };

  return (
    <div className="grid gap-6 pt-4 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="flex gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => {
                setKind(k.value);
                setSelected(null);
                setResults([]);
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                kind === k.value
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/50",
              )}
            >
              <k.icon className="size-3.5" />
              {k.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search_placeholder", {
              kind:
                KINDS.find((k) => k.value === kind)?.label.toLowerCase() ?? "",
            })}
            className="pl-9"
          />
        </div>

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {searching ? (
            <div className="flex items-center gap-2 px-1 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t("searching")}
            </div>
          ) : results.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">
              {query.trim() ? t("no_results") : t("type_to_search")}
            </p>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                  selected?.id === r.id
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:bg-muted/40",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {r.label}
                  </span>
                  {r.sublabel && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.sublabel}
                    </span>
                  )}
                </span>
                {selected?.id === r.id && (
                  <Check className="size-4 shrink-0 text-primary" />
                )}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{t("message_heading")}</h3>
          {selected && (
            <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
              {selected.label}
              <button
                type="button"
                aria-label={t("remove_target_aria")}
                onClick={() => setSelected(null)}
              >
                <X className="size-3" />
              </button>
            </span>
          )}
        </div>

        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("title_placeholder")}
          maxLength={255}
        />
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t("body_placeholder")}
          rows={4}
          className="resize-none"
        />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t("url_placeholder")}
        />

        <Button
          onClick={send}
          disabled={!selected || !title.trim() || !body.trim() || sending}
          className="w-full"
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          {t("send_button")}
        </Button>
        {!selected && (
          <p className="text-center text-xs text-muted-foreground">
            {t("select_target_hint")}
          </p>
        )}
      </div>
    </div>
  );
}

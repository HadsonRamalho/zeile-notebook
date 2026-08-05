"use client";

import { Check, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PickerItem {
  id: string;
  primary: string;
  secondary?: string | undefined;
  badge?: string | undefined;
  avatarUrl?: string | null;
  showAvatar?: boolean;
  disabled?: boolean;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function SearchPicker({
  items,
  value,
  onSelect,
  placeholder,
  emptyText,
}: {
  items: PickerItem[];
  value: string;
  onSelect: (id: string) => void;
  placeholder: string;
  emptyText: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.primary.toLowerCase().includes(q) ||
        (item.secondary?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>

      <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border">
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            {emptyText}
          </p>
        ) : (
          filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={value === item.id}
              disabled={item.disabled}
              onClick={() => onSelect(item.id)}
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                value === item.id
                  ? "bg-primary/15 ring-1 ring-inset ring-primary"
                  : "hover:bg-accent",
              )}
            >
              {item.showAvatar && (
                <Avatar className="size-8 shrink-0">
                  {item.avatarUrl && (
                    <AvatarImage src={item.avatarUrl} alt={item.primary} />
                  )}
                  <AvatarFallback className="text-xs">
                    {getInitials(item.primary)}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {item.primary}
                </p>
                {item.secondary && (
                  <p className="truncate text-xs text-muted-foreground">
                    {item.secondary}
                  </p>
                )}
              </div>
              {item.badge && (
                <Badge variant="secondary" className="shrink-0">
                  {item.badge}
                </Badge>
              )}
              {value === item.id && (
                <Check className="size-4 shrink-0 text-primary" />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

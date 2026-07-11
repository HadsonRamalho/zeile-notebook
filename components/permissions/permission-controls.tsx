"use client";

import { Ban, Check, Eye, EyeOff, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Loader } from "@/components/motion/loader";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type {
  CatalogPermission,
  GrantEffect,
} from "@/lib/types/permission-types";

export type Effect = GrantEffect | "none";

export const permissionsSheetClass = cn(
  "left-0 top-auto bottom-0 w-full max-w-none translate-x-0 translate-y-0",
  "max-h-[90dvh] overflow-y-auto rounded-b-none rounded-t-2xl",
  "sm:inset-x-auto sm:bottom-auto sm:left-[50%] sm:top-[50%]",
  "sm:w-full sm:max-w-lg sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg",
);

export function EffectControl({
  value,
  onChange,
}: {
  value: Effect;
  onChange: (next: Effect) => void;
}) {
  const tr = useTranslations("team_settings.team_role");

  const options: {
    value: Effect;
    label: string;
    icon: typeof Check;
    active: string;
  }[] = [
    {
      value: "allow",
      label: tr("effect_allow"),
      icon: Check,
      active: "bg-primary text-primary-foreground",
    },
    {
      value: "none",
      label: tr("effect_neutral"),
      icon: Minus,
      active: "bg-muted-foreground/15 text-foreground",
    },
    {
      value: "deny",
      label: tr("effect_deny"),
      icon: Ban,
      active: "bg-destructive text-white",
    },
  ];

  return (
    <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
      {options.map((option) => {
        const Icon = option.icon;
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-1 rounded-[5px] px-2 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? option.active
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            <span className="hidden sm:inline">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PermissionRow({
  perm,
  effect,
  busy,
  onChange,
}: {
  perm: CatalogPermission;
  effect: Effect;
  busy: boolean;
  onChange: (next: Effect) => void;
}) {
  const tp = useTranslations("perm");
  const tr = useTranslations("team_settings.team_role");
  const label = tp.has(perm.key) ? tp(perm.key) : perm.key;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-card px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {perm.view === "confidential" && (
          <Badge variant="outline" className="gap-1 text-[11px]">
            <EyeOff className="size-3" /> {tr("badge_confidential")}
          </Badge>
        )}
        {perm.view === "cosmetic" && (
          <Badge
            variant="ghost"
            className="gap-1 text-[11px] text-muted-foreground"
          >
            <Eye className="size-3" /> {tr("badge_cosmetic")}
          </Badge>
        )}
      </div>

      {busy ? (
        <Loader variant="spinner" size={16} className="text-muted-foreground" />
      ) : (
        <EffectControl value={effect} onChange={onChange} />
      )}
    </div>
  );
}

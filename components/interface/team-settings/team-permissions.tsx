"use client";

import {
  ChevronDown,
  Eye,
  EyeOff,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader } from "@/components/motion/loader";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { handleApiError } from "@/lib/api/handle-api-error";
import {
  createTeamGrant,
  deleteTeamGrant,
  getPermissionCatalog,
  getTeamGrants,
} from "@/lib/api/permissions-service";
import { cn } from "@/lib/cn";
import type {
  CatalogPermission,
  GrantEffect,
  PermissionCatalog,
  TeamGrant,
} from "@/lib/types/permission-types";
import type { TeamRole } from "@/lib/types/team-types";

type Effect = GrantEffect | "none";

const MODULE_LABELS: Record<string, string> = {
  notebook: "Notebook",
  team: "Time",
  chat: "Chat",
};

const MODULE_ORDER = ["notebook", "team", "chat"];

interface TeamPermissionsProps {
  teamId: string;
  roles: TeamRole[];
}

export function TeamPermissions({ teamId, roles }: TeamPermissionsProps) {
  const t = useTranslations("api_errors");

  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [grants, setGrants] = useState<TeamGrant[]>([]);
  const [roleId, setRoleId] = useState<string>(roles[0]?.id ?? "");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([getPermissionCatalog(), getTeamGrants(teamId)])
      .then(([cat, grs]) => {
        if (!active) return;
        setCatalog(cat);
        setGrants(grs);
      })
      .catch((err) => handleApiError({ err, t }))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [teamId, t]);

  const effectFor = useCallback(
    (key: string): Effect => {
      const grant = grants.find(
        (g) =>
          g.subject_kind === "role" &&
          g.subject_id === roleId &&
          g.target_kind === "team" &&
          g.permission_key === key,
      );
      return grant?.effect ?? "none";
    },
    [grants, roleId],
  );

  const setEffect = useCallback(
    async (key: string, next: Effect) => {
      if (!roleId || effectFor(key) === next) return;

      const rowId = `${roleId}:${key}`;
      setPending((prev) => new Set(prev).add(rowId));

      const existing = grants.filter(
        (g) =>
          g.subject_kind === "role" &&
          g.subject_id === roleId &&
          g.target_kind === "team" &&
          g.permission_key === key,
      );

      try {
        for (const grant of existing) {
          await deleteTeamGrant(teamId, grant.id);
        }
        if (next !== "none") {
          await createTeamGrant(teamId, {
            subject_kind: "role",
            subject_id: roleId,
            permission_key: key,
            target_kind: "team",
            effect: next,
          });
        }
        const fresh = await getTeamGrants(teamId);
        setGrants(fresh);
      } catch (err) {
        handleApiError({ err, t });
      } finally {
        setPending((prev) => {
          const nextSet = new Set(prev);
          nextSet.delete(rowId);
          return nextSet;
        });
      }
    },
    [roleId, grants, teamId, effectFor, t],
  );

  const modules = useMemo(() => {
    if (!catalog) return [];
    const byModule = new Map<
      string,
      { general: CatalogPermission[]; granular: CatalogPermission[] }
    >();
    for (const perm of catalog.permissions) {
      const module = perm.key.split(".")[0];
      let bucket = byModule.get(module);
      if (!bucket) {
        bucket = { general: [], granular: [] };
        byModule.set(module, bucket);
      }
      if (perm.tier === "general") bucket.general.push(perm);
      else bucket.granular.push(perm);
    }
    return [...byModule.entries()].sort(
      (a, b) =>
        (MODULE_ORDER.indexOf(a[0]) + 1 || 99) -
        (MODULE_ORDER.indexOf(b[0]) + 1 || 99),
    );
  }, [catalog]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader variant="spinner" size={28} className="text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="size-5 text-primary" />
            Permissões do cargo
          </h3>
          <p className="max-w-prose text-sm text-muted-foreground">
            Defina o que cada cargo pode fazer nos recursos deste time. As
            permissões gerais cobrem os casos comuns; as granulares permitem
            exceções finas por tipo de bloco ou ação.
          </p>
        </div>

        <div className="w-full sm:w-56">
          <Select value={roleId} onValueChange={setRoleId}>
            <SelectTrigger aria-label="Selecionar cargo">
              <SelectValue placeholder="Selecionar cargo" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((role) => (
                <SelectItem key={role.id} value={role.id}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {modules.map(([module, buckets]) => (
        <section key={module} className="space-y-3">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {MODULE_LABELS[module] ?? module}
          </h4>

          <div className="divide-y divide-border overflow-hidden rounded-lg border">
            {buckets.general.map((perm) => (
              <PermissionRow
                key={perm.key}
                perm={perm}
                effect={effectFor(perm.key)}
                busy={pending.has(`${roleId}:${perm.key}`)}
                onChange={(next) => setEffect(perm.key, next)}
              />
            ))}
          </div>

          {buckets.granular.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                <SlidersHorizontal className="size-4" />
                Permissões granulares
                <span className="text-xs text-muted-foreground/70">
                  ({buckets.granular.length})
                </span>
                <ChevronDown className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 divide-y divide-border overflow-hidden rounded-lg border">
                  {buckets.granular.map((perm) => (
                    <PermissionRow
                      key={perm.key}
                      perm={perm}
                      effect={effectFor(perm.key)}
                      busy={pending.has(`${roleId}:${perm.key}`)}
                      onChange={(next) => setEffect(perm.key, next)}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </section>
      ))}
    </div>
  );
}

function PermissionRow({
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
  const label = tp.has(perm.key) ? tp(perm.key) : perm.key;

  return (
    <div className="flex items-center justify-between gap-4 bg-card px-4 py-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {perm.view === "confidential" && (
            <Badge variant="outline" className="gap-1 text-[11px]">
              <EyeOff className="size-3" /> confidencial
            </Badge>
          )}
          {perm.view === "cosmetic" && (
            <Badge
              variant="ghost"
              className="gap-1 text-[11px] text-muted-foreground"
            >
              <Eye className="size-3" /> visual
            </Badge>
          )}
        </div>
        <code className="block truncate text-xs text-muted-foreground/70">
          {perm.key}
        </code>
      </div>

      <div className="shrink-0">
        {busy ? (
          <div className="flex h-8 w-[168px] items-center justify-center">
            <Loader
              variant="spinner"
              size={16}
              className="text-muted-foreground"
            />
          </div>
        ) : (
          <EffectControl value={effect} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

const OPTIONS: { value: Effect; label: string; active: string }[] = [
  { value: "none", label: "Neutro", active: "bg-muted text-foreground" },
  {
    value: "allow",
    label: "Permitir",
    active: "bg-primary text-primary-foreground",
  },
  {
    value: "deny",
    label: "Bloquear",
    active: "bg-destructive text-white",
  },
];

function EffectControl({
  value,
  onChange,
}: {
  value: Effect;
  onChange: (next: Effect) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
      {OPTIONS.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? option.active
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { ChevronDown, KeyRound, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader } from "@/components/motion/loader";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { fetchTeamRoles } from "@/lib/api/teams-service";
import { cn } from "@/lib/cn";
import type {
  CatalogPermission,
  GrantEffect,
  PermissionCatalog,
  TeamGrant,
} from "@/lib/types/permission-types";
import type { TeamRole } from "@/lib/types/team-types";

type Effect = GrantEffect | "none";

export function TeamNotebookPermissions({
  notebookId,
  teamId,
}: {
  notebookId: string;
  teamId: string;
}) {
  const tr = useTranslations("team_settings.team_role");
  const te = useTranslations("api_errors");

  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [grants, setGrants] = useState<TeamGrant[]>([]);
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [roleId, setRoleId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    Promise.all([
      getPermissionCatalog(),
      getTeamGrants(teamId),
      fetchTeamRoles(teamId),
    ])
      .then(([cat, grs, rls]) => {
        if (!active) return;
        setCatalog(cat);
        setGrants(grs);
        setRoles(rls);
        setRoleId((current) => current || rls[0]?.id || "");
      })
      .catch((err) => handleApiError({ err, t: te }))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [open, teamId, te]);

  const roleLabel = useCallback(
    (role: TeamRole) => {
      if (role.name === "Owner") return tr("defaults.owner");
      if (role.name === "Member") return tr("defaults.member");
      return role.name;
    },
    [tr],
  );

  const buckets = useMemo(() => {
    const general: CatalogPermission[] = [];
    const granular: CatalogPermission[] = [];
    for (const perm of catalog?.permissions ?? []) {
      if (!perm.key.startsWith("notebook.")) continue;
      if (perm.tier === "general") general.push(perm);
      else granular.push(perm);
    }
    return { general, granular };
  }, [catalog]);

  const effectFor = useCallback(
    (key: string): Effect =>
      grants.find(
        (g) =>
          g.subject_kind === "role" &&
          g.subject_id === roleId &&
          g.target_kind === "notebook" &&
          g.target_id === notebookId &&
          g.permission_key === key,
      )?.effect ?? "none",
    [grants, roleId, notebookId],
  );

  const setEffect = useCallback(
    async (key: string, next: Effect) => {
      if (!roleId || effectFor(key) === next) return;
      setPending((prev) => new Set(prev).add(key));
      const existing = grants.filter(
        (g) =>
          g.subject_kind === "role" &&
          g.subject_id === roleId &&
          g.target_kind === "notebook" &&
          g.target_id === notebookId &&
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
            target_kind: "notebook",
            target_id: notebookId,
            effect: next,
          });
        }
        setGrants(await getTeamGrants(teamId));
      } catch (err) {
        handleApiError({ err, t: te });
      } finally {
        setPending((prev) => {
          const nextSet = new Set(prev);
          nextSet.delete(key);
          return nextSet;
        });
      }
    },
    [roleId, grants, notebookId, teamId, effectFor, te],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="size-4" />
          {tr("notebook_permissions")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr("notebook_permissions")}</DialogTitle>
          <DialogDescription>
            {tr("notebook_permissions_hint")}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader
              variant="spinner"
              size={24}
              className="text-muted-foreground"
            />
          </div>
        ) : (
          <div className="space-y-4">
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger aria-label={tr("select_role")}>
                <SelectValue placeholder={tr("select_role")} />
              </SelectTrigger>
              <SelectContent>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {roleLabel(role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="divide-y divide-border overflow-hidden rounded-lg border">
              {buckets.general.map((perm) => (
                <PermRow
                  key={perm.key}
                  perm={perm}
                  effect={effectFor(perm.key)}
                  busy={pending.has(perm.key)}
                  onChange={(next) => setEffect(perm.key, next)}
                />
              ))}
            </div>

            {buckets.granular.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger className="group flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                  <SlidersHorizontal className="size-4" />
                  {tr("granular_toggle")}
                  <span className="text-xs text-muted-foreground/70">
                    ({buckets.granular.length})
                  </span>
                  <ChevronDown className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 divide-y divide-border overflow-hidden rounded-lg border">
                    {buckets.granular.map((perm) => (
                      <PermRow
                        key={perm.key}
                        perm={perm}
                        effect={effectFor(perm.key)}
                        busy={pending.has(perm.key)}
                        onChange={(next) => setEffect(perm.key, next)}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PermRow({
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

  const options: { value: Effect; label: string; active: string }[] = [
    {
      value: "none",
      label: tr("effect_neutral"),
      active: "bg-muted text-foreground",
    },
    {
      value: "allow",
      label: tr("effect_allow"),
      active: "bg-primary text-primary-foreground",
    },
    {
      value: "deny",
      label: tr("effect_deny"),
      active: "bg-destructive text-white",
    },
  ];

  return (
    <div className="flex items-center justify-between gap-4 bg-card px-4 py-3">
      <span className="min-w-0 truncate text-sm font-medium text-foreground">
        {label}
      </span>
      {busy ? (
        <Loader variant="spinner" size={16} className="text-muted-foreground" />
      ) : (
        <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={effect === option.value}
              onClick={() => onChange(option.value)}
              className={cn(
                "rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors duration-150",
                effect === option.value
                  ? option.active
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

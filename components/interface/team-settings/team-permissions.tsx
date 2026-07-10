"use client";

import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader } from "@/components/motion/loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
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
import {
  createTeamRole,
  fetchTeamRoles,
  updateRole,
} from "@/lib/api/teams-service";
import { cn } from "@/lib/cn";
import type {
  CatalogPermission,
  GrantEffect,
  PermissionCatalog,
  TeamGrant,
} from "@/lib/types/permission-types";
import type { TeamRole } from "@/lib/types/team-types";

type Effect = GrantEffect | "none";

const MODULE_ORDER = ["notebook", "team", "chat"];

const BLANK_ROLE = {
  can_read: false,
  can_write: false,
  can_manage_privacy: false,
  can_manage_clones: false,
  can_invite_users: false,
  can_remove_users: false,
  can_manage_permissions: false,
  can_manage_team: false,
};

interface TeamPermissionsProps {
  teamId: string;
  roles: TeamRole[];
  onRolesChanged: () => void;
}

export function TeamPermissions({
  teamId,
  roles: rolesProp,
  onRolesChanged,
}: TeamPermissionsProps) {
  const tr = useTranslations("team_settings.team_role");
  const te = useTranslations("api_errors");

  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [grants, setGrants] = useState<TeamGrant[]>([]);
  const [roles, setRoles] = useState<TeamRole[]>(rolesProp);
  const [roleId, setRoleId] = useState<string>(rolesProp[0]?.id ?? "");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<Set<string>>(new Set());

  const [editorMode, setEditorMode] = useState<"idle" | "create" | "rename">(
    "idle",
  );
  const [editorValue, setEditorValue] = useState("");
  const [savingRole, setSavingRole] = useState(false);

  useEffect(() => {
    setRoles(rolesProp);
  }, [rolesProp]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([getPermissionCatalog(), getTeamGrants(teamId)])
      .then(([cat, grs]) => {
        if (!active) return;
        setCatalog(cat);
        setGrants(grs);
      })
      .catch((err) => handleApiError({ err, t: te }))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [teamId, te]);

  const roleLabel = useCallback(
    (role: TeamRole) => {
      if (role.name === "Owner") return tr("defaults.owner");
      if (role.name === "Member") return tr("defaults.member");
      return role.name;
    },
    [tr],
  );

  const effectFor = useCallback(
    (key: string): Effect =>
      grants.find(
        (g) =>
          g.subject_kind === "role" &&
          g.subject_id === roleId &&
          g.target_kind === "team" &&
          g.permission_key === key,
      )?.effect ?? "none",
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
        setGrants(await getTeamGrants(teamId));
      } catch (err) {
        handleApiError({ err, t: te });
      } finally {
        setPending((prev) => {
          const nextSet = new Set(prev);
          nextSet.delete(rowId);
          return nextSet;
        });
      }
    },
    [roleId, grants, teamId, effectFor, te],
  );

  const startCreate = () => {
    setEditorMode("create");
    setEditorValue("");
  };

  const startRename = () => {
    const current = roles.find((r) => r.id === roleId);
    if (!current) return;
    setEditorMode("rename");
    setEditorValue(current.name);
  };

  const cancelEditor = () => {
    setEditorMode("idle");
    setEditorValue("");
  };

  const submitEditor = async () => {
    const name = editorValue.trim();
    if (name.length < 2) return;

    setSavingRole(true);
    try {
      if (editorMode === "create") {
        const before = new Set(roles.map((r) => r.id));
        await createTeamRole(teamId, { name, ...BLANK_ROLE });
        const fresh = await fetchTeamRoles(teamId);
        setRoles(fresh);
        const created = fresh.find((r) => !before.has(r.id));
        if (created) setRoleId(created.id);
        toast.success(tr("role_created"));
      } else if (editorMode === "rename") {
        await updateRole(teamId, { id: roleId, name });
        setRoles(await fetchTeamRoles(teamId));
        toast.success(tr("role_renamed"));
      }
      onRolesChanged();
      cancelEditor();
    } catch (err) {
      handleApiError({ err, t: te });
    } finally {
      setSavingRole(false);
    }
  };

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

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-5 text-primary" />
          {tr("title")}
        </h3>
        <p className="max-w-prose text-sm text-muted-foreground">
          {tr("granular_hint")}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {editorMode === "idle" ? (
          <>
            <div className="w-full sm:w-64">
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
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={startRename}
              disabled={!roleId}
            >
              <Pencil className="size-4" />
              {tr("rename_button")}
            </Button>
            <Button variant="outline" size="sm" onClick={startCreate}>
              <Plus className="size-4" />
              {tr("new_role_button")}
            </Button>
          </>
        ) : (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Input
              autoFocus
              value={editorValue}
              onChange={(e) => setEditorValue(e.target.value)}
              placeholder={tr("name_placeholder")}
              className="w-full sm:w-64"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitEditor();
                if (e.key === "Escape") cancelEditor();
              }}
            />
            <Button
              size="sm"
              onClick={submitEditor}
              disabled={savingRole || editorValue.trim().length < 2}
            >
              {savingRole ? (
                <Loader variant="spinner" size={16} />
              ) : (
                <Check className="size-4" />
              )}
              {tr("save")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelEditor}
              disabled={savingRole}
            >
              <X className="size-4" />
              {tr("cancel")}
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader
            variant="spinner"
            size={28}
            className="text-muted-foreground"
          />
        </div>
      ) : (
        modules.map(([module, buckets]) => (
          <section key={module} className="space-y-3">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {tr.has(`modules.${module}`) ? tr(`modules.${module}`) : module}
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
                  {tr("granular_toggle")}
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
        ))
      )}
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
  const tr = useTranslations("team_settings.team_role");
  const label = tp.has(perm.key) ? tp(perm.key) : perm.key;

  return (
    <div className="flex items-center justify-between gap-4 bg-card px-4 py-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
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
        <code className="block truncate text-xs text-muted-foreground/70">
          {perm.key}
        </code>
      </div>

      <div className="shrink-0">
        {busy ? (
          <div className="flex h-8 w-[190px] items-center justify-center">
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

function EffectControl({
  value,
  onChange,
}: {
  value: Effect;
  onChange: (next: Effect) => void;
}) {
  const tr = useTranslations("team_settings.team_role");

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
    <div className="inline-flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
      {options.map((option) => {
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

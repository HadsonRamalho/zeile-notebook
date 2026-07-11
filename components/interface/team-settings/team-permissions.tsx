"use client";

import {
  Check,
  ChevronDown,
  Pencil,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader } from "@/components/motion/loader";
import { PermissionRow } from "@/components/permissions/permission-controls";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  fetchTeamMembers,
  fetchTeamPages,
  fetchTeamRoles,
  updateRole,
} from "@/lib/api/teams-service";
import { cn } from "@/lib/cn";
import type { Notebook } from "@/lib/types";
import type {
  CatalogPermission,
  GrantEffect,
  PermissionCatalog,
  TeamGrant,
} from "@/lib/types/permission-types";
import type {
  TeamMemberWithRoleAndUserData,
  TeamRole,
} from "@/lib/types/team-types";

type Effect = GrantEffect | "none";

const MODULE_ORDER = ["notebook", "team", "chat"];

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

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
  initialTarget?: { kind: "role" | "user"; id: string } | null;
}

export function TeamPermissions({
  teamId,
  roles: rolesProp,
  onRolesChanged,
  initialTarget,
}: TeamPermissionsProps) {
  const tr = useTranslations("team_settings.team_role");
  const te = useTranslations("api_errors");

  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [grants, setGrants] = useState<TeamGrant[]>([]);
  const [roles, setRoles] = useState<TeamRole[]>(rolesProp);
  const [members, setMembers] = useState<TeamMemberWithRoleAndUserData[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [mode, setMode] = useState<"role" | "member">("role");
  const [roleId, setRoleId] = useState<string>(rolesProp[0]?.id ?? "");
  const [memberUserId, setMemberUserId] = useState<string>("");
  const [memberSearch, setMemberSearch] = useState("");
  const [scopeSel, setScopeSel] = useState<string>("team");
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
    Promise.all([
      getPermissionCatalog(),
      getTeamGrants(teamId),
      fetchTeamMembers(teamId),
      fetchTeamPages(teamId),
    ])
      .then(([cat, grs, mbs, nbs]) => {
        if (!active) return;
        setCatalog(cat);
        setGrants(grs);
        setMembers(mbs);
        setNotebooks(nbs);
      })
      .catch((err) => handleApiError({ err, t: te }))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [teamId, te]);

  useEffect(() => {
    if (!initialTarget) return;
    if (initialTarget.kind === "role") {
      setMode("role");
      setRoleId(initialTarget.id);
    } else {
      setMode("member");
      setMemberUserId(initialTarget.id);
    }
  }, [initialTarget]);

  const subjectKind: "role" | "user" = mode === "role" ? "role" : "user";
  const subjectId = mode === "role" ? roleId : memberUserId;
  const targetKind: "team" | "notebook" =
    scopeSel === "team" ? "team" : "notebook";
  const targetId =
    scopeSel === "team" ? null : scopeSel.slice("notebook:".length);

  const matchesSelection = useCallback(
    (g: TeamGrant, key: string) =>
      g.subject_kind === subjectKind &&
      g.subject_id === subjectId &&
      g.target_kind === targetKind &&
      (targetKind === "team" || g.target_id === targetId) &&
      g.permission_key === key,
    [subjectKind, subjectId, targetKind, targetId],
  );

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
      grants.find((g) => matchesSelection(g, key))?.effect ?? "none",
    [grants, matchesSelection],
  );

  const rowKey = (key: string) =>
    `${subjectKind}:${subjectId}:${scopeSel}:${key}`;

  const setEffect = useCallback(
    async (key: string, next: Effect) => {
      if (!subjectId || effectFor(key) === next) return;

      const rowId = `${subjectKind}:${subjectId}:${scopeSel}:${key}`;
      setPending((prev) => new Set(prev).add(rowId));

      const existing = grants.filter((g) => matchesSelection(g, key));

      try {
        for (const grant of existing) {
          await deleteTeamGrant(teamId, grant.id);
        }
        if (next !== "none") {
          await createTeamGrant(teamId, {
            subject_kind: subjectKind,
            subject_id: subjectId,
            permission_key: key,
            target_kind: targetKind,
            target_id: targetId ?? undefined,
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
    [
      subjectId,
      subjectKind,
      scopeSel,
      targetKind,
      targetId,
      grants,
      teamId,
      effectFor,
      matchesSelection,
      te,
    ],
  );

  const startCreate = () => {
    setEditorMode("create");
    setEditorValue("");
  };

  const startRename = () => {
    const current = roles.find((r) => r.id === subjectId);
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
        if (created) {
          setRoleId(created.id);
          setMode("role");
        }
        toast.success(tr("role_created"));
      } else if (editorMode === "rename") {
        await updateRole(teamId, { id: subjectId, name });
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
      if (targetKind === "notebook" && !perm.targets.includes("notebook")) {
        continue;
      }
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
  }, [catalog, targetKind]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      ([m]) =>
        m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [members, memberSearch]);

  const scopeSelect = (
    <div className="w-full sm:w-56">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {tr("scope_label")}
      </span>
      <Select value={scopeSel} onValueChange={setScopeSel}>
        <SelectTrigger aria-label={tr("scope_label")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="team">{tr("scope_team")}</SelectItem>
          {notebooks.map((nb) => (
            <SelectItem key={nb.id} value={`notebook:${nb.id}`}>
              {nb.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

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

      <div className="inline-flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
        {(["role", "member"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-sm font-medium transition-colors",
              mode === m
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "role" ? (
              <Shield className="size-4" />
            ) : (
              <Users className="size-4" />
            )}
            {m === "role" ? tr("tab_roles") : tr("tab_members")}
          </button>
        ))}
      </div>

      {mode === "role" ? (
        <div className="flex flex-wrap items-end gap-2">
          {editorMode === "idle" ? (
            <>
              <div className="w-full sm:w-72">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  {tr("subject_role_prefix")}
                </span>
                <div className="flex items-center gap-1">
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
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label={tr("rename_button")}
                    title={tr("rename_button")}
                    onClick={startRename}
                    disabled={!roleId}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={startCreate}>
                <Plus className="size-4" />
                {tr("new_role_button")}
              </Button>
              {scopeSelect}
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
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="relative w-full sm:w-72">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {tr("subject_user_prefix")}
              </span>
              <Search className="absolute left-3 top-[calc(50%+0.35rem)] size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder={tr("member_search_placeholder")}
                className="pl-9"
              />
            </div>
            {scopeSelect}
          </div>

          <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border">
            {filteredMembers.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                {tr("member_search_empty")}
              </p>
            ) : (
              filteredMembers.map(([m]) => {
                const role = roles.find((r) => r.id === m.role_id);
                return (
                  <button
                    key={m.user_id}
                    type="button"
                    aria-pressed={memberUserId === m.user_id}
                    onClick={() => setMemberUserId(m.user_id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                      memberUserId === m.user_id
                        ? "bg-primary/15 ring-1 ring-inset ring-primary"
                        : "hover:bg-accent",
                    )}
                  >
                    <Avatar className="size-8">
                      {m.avatar_url && (
                        <AvatarImage src={m.avatar_url} alt={m.name} />
                      )}
                      <AvatarFallback className="text-xs">
                        {getInitials(m.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {m.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.email}
                      </p>
                    </div>
                    {role && (
                      <Badge variant="secondary" className="shrink-0">
                        {roleLabel(role)}
                      </Badge>
                    )}
                    {memberUserId === m.user_id && (
                      <Check className="size-4 shrink-0 text-primary" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

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
                  busy={pending.has(rowKey(perm.key))}
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
                        busy={pending.has(rowKey(perm.key))}
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

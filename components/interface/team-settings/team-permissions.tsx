"use client";

import {
  BookOpen,
  Check,
  ChevronDown,
  Pencil,
  Plus,
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
import {
  type PickerItem,
  SearchPicker,
} from "@/components/permissions/search-picker";
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
import { useAuth } from "@/context/auth-context";
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
import { cn } from "@/lib/utils";

type Effect = GrantEffect | "none";

const MODULE_ORDER = ["notebook", "team", "chat"];

const BLANK_ROLE = {
  canRead: false,
  canWrite: false,
  canManagePrivacy: false,
  canManageClones: false,
  canInviteUsers: false,
  canRemoveUsers: false,
  canManagePermissions: false,
  canManageTeam: false,
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
  const { user: authUser } = useAuth();

  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [grants, setGrants] = useState<TeamGrant[]>([]);
  const [roles, setRoles] = useState<TeamRole[]>(rolesProp);
  const [members, setMembers] = useState<TeamMemberWithRoleAndUserData[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [mode, setMode] = useState<"role" | "member" | "notebook">("role");
  const [roleId, setRoleId] = useState<string>(rolesProp[0]?.id ?? "");
  const [memberUserId, setMemberUserId] = useState<string>("");
  const [nbNotebookId, setNbNotebookId] = useState<string>("");
  const [nbSubjectKind, setNbSubjectKind] = useState<"role" | "member">("role");
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

  const subjectKind: "role" | "user" =
    mode === "member"
      ? "user"
      : mode === "role"
        ? "role"
        : nbSubjectKind === "member"
          ? "user"
          : "role";
  const subjectId = subjectKind === "role" ? roleId : memberUserId;
  const targetKind: "team" | "notebook" =
    mode === "notebook"
      ? "notebook"
      : scopeSel === "team"
        ? "team"
        : "notebook";
  const targetId =
    mode === "notebook"
      ? nbNotebookId || null
      : scopeSel === "team"
        ? null
        : scopeSel.slice("notebook:".length);

  const selfUserId = authUser?.id;
  const selfRoleId = members.find(([m]) => m.userId === selfUserId)?.[0].roleId;

  const matchesSelection = useCallback(
    (g: TeamGrant, key: string) =>
      g.subjectKind === subjectKind &&
      g.subjectId === subjectId &&
      g.targetKind === targetKind &&
      (targetKind === "team" || g.targetId === targetId) &&
      g.permissionKey === key,
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
            subjectKind: subjectKind,
            subjectId: subjectId,
            permissionKey: key,
            targetKind: targetKind,
            targetId: targetId,
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
      const module = perm.key.split(".")[0]!;
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

  const roleItems = useMemo<PickerItem[]>(
    () =>
      roles.map((r) => ({
        id: r.id,
        primary: roleLabel(r),
        disabled: r.id === selfRoleId,
      })),
    [roles, roleLabel, selfRoleId],
  );

  const memberItems = useMemo<PickerItem[]>(
    () =>
      members.map(([m]) => {
        const role = roles.find((r) => r.id === m.roleId);
        return {
          id: m.userId,
          primary: m.name,
          secondary: m.email,
          badge: role ? roleLabel(role) : undefined,
          avatarUrl: m.avatarUrl,
          showAvatar: true,
          disabled: m.userId === selfUserId,
        };
      }),
    [members, roles, roleLabel, selfUserId],
  );

  const notebookItems = useMemo<PickerItem[]>(
    () => notebooks.map((nb) => ({ id: nb.id, primary: nb.title })),
    [notebooks],
  );

  const gridReady =
    mode === "notebook" ? !!nbNotebookId && !!subjectId : !!subjectId;

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

      <div className="inline-flex flex-wrap items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
        {(["role", "member", "notebook"] as const).map((m) => (
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
            ) : m === "member" ? (
              <Users className="size-4" />
            ) : (
              <BookOpen className="size-4" />
            )}
            {tr(
              m === "role"
                ? "tab_roles"
                : m === "member"
                  ? "tab_members"
                  : "tab_notebooks",
            )}
          </button>
        ))}
      </div>

      {mode === "role" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            {editorMode === "idle" ? (
              <>
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
            {scopeSelect}
          </div>
          <SearchPicker
            items={roleItems}
            value={roleId}
            onSelect={setRoleId}
            placeholder={tr("role_search_placeholder")}
            emptyText={tr("member_search_empty")}
          />
        </div>
      )}

      {mode === "member" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">{scopeSelect}</div>
          <SearchPicker
            items={memberItems}
            value={memberUserId}
            onSelect={setMemberUserId}
            placeholder={tr("member_search_placeholder")}
            emptyText={tr("member_search_empty")}
          />
        </div>
      )}

      {mode === "notebook" && (
        <div className="space-y-3">
          <div>
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              {tr("tab_notebooks")}
            </span>
            <SearchPicker
              items={notebookItems}
              value={nbNotebookId}
              onSelect={setNbNotebookId}
              placeholder={tr("notebook_search_placeholder")}
              emptyText={tr("notebook_search_empty")}
            />
          </div>

          {nbNotebookId && (
            <div className="space-y-2">
              <div className="inline-flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
                {(["role", "member"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={nbSubjectKind === k}
                    onClick={() => setNbSubjectKind(k)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-sm font-medium transition-colors",
                      nbSubjectKind === k
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {k === "role" ? (
                      <Shield className="size-4" />
                    ) : (
                      <Users className="size-4" />
                    )}
                    {tr(k === "role" ? "tab_roles" : "tab_members")}
                  </button>
                ))}
              </div>
              {nbSubjectKind === "role" ? (
                <SearchPicker
                  items={roleItems}
                  value={roleId}
                  onSelect={setRoleId}
                  placeholder={tr("role_search_placeholder")}
                  emptyText={tr("member_search_empty")}
                />
              ) : (
                <SearchPicker
                  items={memberItems}
                  value={memberUserId}
                  onSelect={setMemberUserId}
                  placeholder={tr("member_search_placeholder")}
                  emptyText={tr("member_search_empty")}
                />
              )}
            </div>
          )}
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
      ) : !gridReady ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {tr("select_subject_hint")}
        </p>
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

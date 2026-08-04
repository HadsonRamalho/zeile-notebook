"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader } from "@/components/motion/loader";
import {
  PermissionRow,
  permissionsSheetClass,
} from "@/components/permissions/permission-controls";
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
  open,
  onOpenChange,
}: {
  notebookId: string;
  teamId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tr = useTranslations("team_settings.team_role");
  const te = useTranslations("api_errors");

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
          g.subjectKind === "role" &&
          g.subjectId === roleId &&
          g.targetKind === "notebook" &&
          g.targetId === notebookId &&
          g.permissionKey === key,
      )?.effect ?? "none",
    [grants, roleId, notebookId],
  );

  const setEffect = useCallback(
    async (key: string, next: Effect) => {
      if (!roleId || effectFor(key) === next) return;
      setPending((prev) => new Set(prev).add(key));
      const existing = grants.filter(
        (g) =>
          g.subjectKind === "role" &&
          g.subjectId === roleId &&
          g.targetKind === "notebook" &&
          g.targetId === notebookId &&
          g.permissionKey === key,
      );
      try {
        for (const grant of existing) {
          await deleteTeamGrant(teamId, grant.id);
        }
        if (next !== "none") {
          await createTeamGrant(teamId, {
            subjectKind: "role",
            subjectId: roleId,
            permissionKey: key,
            targetKind: "notebook",
            targetId: notebookId,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={permissionsSheetClass}>
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
                <PermissionRow
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
                      <PermissionRow
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

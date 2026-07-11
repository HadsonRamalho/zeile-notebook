"use client";

import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader } from "@/components/motion/loader";
import {
  PermissionRow,
  permissionsSheetClass,
} from "@/components/permissions/permission-controls";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { handleApiError } from "@/lib/api/handle-api-error";
import {
  createPublicGrant,
  deletePublicGrant,
  getPermissionCatalog,
  getPublicGrants,
} from "@/lib/api/permissions-service";
import type {
  GrantEffect,
  PermissionCatalog,
  TeamGrant,
} from "@/lib/types/permission-types";

type Effect = GrantEffect | "none";

export function PublicNotebookPermissions({
  notebookId,
}: {
  notebookId: string;
}) {
  const tr = useTranslations("team_settings.team_role");
  const te = useTranslations("api_errors");

  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [grants, setGrants] = useState<TeamGrant[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    Promise.all([getPermissionCatalog(), getPublicGrants(notebookId)])
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
  }, [open, notebookId, te]);

  const permissions = useMemo(
    () =>
      (catalog?.permissions ?? []).filter(
        (p) =>
          p.tier === "general" &&
          p.key.startsWith("notebook.") &&
          p.key !== "notebook.delete",
      ),
    [catalog],
  );

  const effectFor = useCallback(
    (key: string): Effect =>
      grants.find((g) => g.permission_key === key)?.effect ?? "none",
    [grants],
  );

  const setEffect = useCallback(
    async (key: string, next: Effect) => {
      if (effectFor(key) === next) return;
      setPending((prev) => new Set(prev).add(key));
      const existing = grants.filter((g) => g.permission_key === key);
      try {
        for (const grant of existing) {
          await deletePublicGrant(notebookId, grant.id);
        }
        if (next !== "none") {
          await createPublicGrant(notebookId, {
            permission_key: key,
            effect: next,
          });
        }
        setGrants(await getPublicGrants(notebookId));
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
    [effectFor, grants, notebookId, te],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Globe className="size-4" />
          {tr("public_permissions")}
        </Button>
      </DialogTrigger>
      <DialogContent className={permissionsSheetClass}>
        <DialogHeader>
          <DialogTitle>{tr("public_permissions")}</DialogTitle>
          <DialogDescription>{tr("public_permissions_hint")}</DialogDescription>
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
          <div className="divide-y divide-border overflow-hidden rounded-lg border">
            {permissions.map((perm) => (
              <PermissionRow
                key={perm.key}
                perm={perm}
                effect={effectFor(perm.key)}
                busy={pending.has(perm.key)}
                onChange={(next) => setEffect(perm.key, next)}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

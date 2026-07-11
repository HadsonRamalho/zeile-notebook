"use client";

import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader } from "@/components/motion/loader";
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
import { cn } from "@/lib/cn";
import type {
  CatalogPermission,
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
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
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
              <PublicPermissionRow
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

function PublicPermissionRow({
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
      <span className="text-sm font-medium text-foreground">{label}</span>
      {busy ? (
        <Loader variant="spinner" size={16} className="text-muted-foreground" />
      ) : (
        <div className="inline-flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
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

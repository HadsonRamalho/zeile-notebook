"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildImpliedIndex, can as evalCan } from "@/domain/permissions/engine";
import {
  getNotebookCapabilities,
  getPermissionCatalog,
} from "@/lib/api/permissions-service";
import type {
  CapabilitySnapshot,
  PermissionCatalog,
  PermissionTarget,
} from "@/types/permission-types";

let catalogCache: PermissionCatalog | null = null;

export type CanFn = (
  key: string,
  target?: Partial<Omit<PermissionTarget, "notebookId">>,
) => boolean;

export interface CapabilitiesController {
  can: CanFn;
  snapshot: CapabilitySnapshot | null;
  ready: boolean;
  refetch: () => Promise<void>;
}

export function useCapabilities(
  notebookId: string | null,
): CapabilitiesController {
  const [snapshot, setSnapshot] = useState<CapabilitySnapshot | null>(null);
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(
    catalogCache,
  );

  const refetch = useCallback(async () => {
    if (!notebookId) return;
    const result = await getNotebookCapabilities(notebookId);
    setSnapshot(result.isOk() ? result.data : { all: false, grants: [] });
  }, [notebookId]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!catalogCache) {
        const result = await getPermissionCatalog();
        catalogCache = result.isOk() ? result.data : { permissions: [] };
      }
      if (active) setCatalog(catalogCache);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const implied = useMemo(
    () => (catalog ? buildImpliedIndex(catalog) : new Map<string, string[]>()),
    [catalog],
  );

  const can = useCallback<CanFn>(
    (key, target) => {
      if (!snapshot || !notebookId) return false;
      return evalCan(snapshot, implied, key, {
        notebookId,
        blockId: target?.blockId ?? null,
        blockType: target?.blockType ?? null,
      });
    },
    [snapshot, implied, notebookId],
  );

  return { can, snapshot, ready: snapshot !== null, refetch };
}

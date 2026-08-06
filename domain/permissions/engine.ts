import type {
  CapabilitySnapshot,
  GrantView,
  PermissionCatalog,
  PermissionTarget,
} from "@/types/permission-types";

export function buildImpliedIndex(
  catalog: PermissionCatalog,
): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const permission of catalog.permissions) {
    index.set(permission.key, permission.impliedBy);
  }
  return index;
}

function effectiveKeys(
  key: string,
  implied: Map<string, string[]>,
): Set<string> {
  const out = new Set<string>();
  const stack = [key];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (out.has(current)) continue;
    out.add(current);
    for (const parent of implied.get(current) ?? []) {
      stack.push(parent);
    }
  }
  return out;
}

function targetLevel(
  grant: GrantView,
  target: PermissionTarget,
): number | null {
  switch (grant.targetKind) {
    case "global":
      return 0;
    case "team":
      return 1;
    case "notebook":
      return grant.targetId === target.notebookId ? 2 : null;
    case "block_type":
      return grant.targetValue != null &&
        target.blockType != null &&
        grant.targetValue === target.blockType
        ? 3
        : null;
    case "block":
      return grant.targetId != null &&
        target.blockId != null &&
        grant.targetId === target.blockId
        ? 4
        : null;
    default:
      return null;
  }
}

export function can(
  snapshot: CapabilitySnapshot,
  implied: Map<string, string[]>,
  key: string,
  target: PermissionTarget,
): boolean {
  if (snapshot.all) return true;

  const keys = effectiveKeys(key, implied);

  let bestLevel = -1;
  let denyAtBest = false;
  let allowAtBest = false;

  for (const grant of snapshot.grants) {
    if (!keys.has(grant.permissionKey)) continue;
    const level = targetLevel(grant, target);
    if (level === null) continue;

    if (level > bestLevel) {
      bestLevel = level;
      denyAtBest = grant.effect === "deny";
      allowAtBest = grant.effect === "allow";
    } else if (level === bestLevel) {
      if (grant.effect === "deny") denyAtBest = true;
      else allowAtBest = true;
    }
  }

  if (bestLevel < 0) return false;
  if (denyAtBest) return false;
  return allowAtBest;
}

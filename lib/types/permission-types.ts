export type Tier = "general" | "granular";

export type PermissionTargetKind =
  | "team"
  | "notebook"
  | "block"
  | "block_type"
  | "chat"
  | "global";

export type ViewSensitivity = "cosmetic" | "confidential";

export type GrantEffect = "allow" | "deny";

export interface CatalogPermission {
  key: string;
  tier: Tier;
  targets: PermissionTargetKind[];
  label: string;
  implied_by: string[];
  view: ViewSensitivity | null;
}

export interface PermissionCatalog {
  permissions: CatalogPermission[];
}

export interface GrantView {
  permission_key: string;
  effect: GrantEffect;
  target_kind: PermissionTargetKind;
  target_id: string | null;
  target_value: string | null;
}

export interface CapabilitySnapshot {
  all: boolean;
  grants: GrantView[];
}

export interface PermissionTarget {
  notebookId: string;
  blockId?: string | null;
  blockType?: string | null;
}

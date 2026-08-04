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
  impliedBy: string[];
  view: ViewSensitivity | null;
}

export interface PermissionCatalog {
  permissions: CatalogPermission[];
}

export interface GrantView {
  permissionKey: string;
  effect: GrantEffect;
  targetKind: PermissionTargetKind;
  targetId: string | null;
  targetValue: string | null;
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

export type GrantSubjectKind = "role" | "user" | "principal";

export interface TeamGrant {
  id: string;
  subjectKind: GrantSubjectKind;
  subjectId: string | null;
  subjectPrincipal: string | null;
  scopeTeamId: string | null;
  permissionKey: string;
  targetKind: PermissionTargetKind;
  targetId: string | null;
  targetValue: string | null;
  effect: GrantEffect;
  createdAt: string;
}

export interface CreateGrantRequest {
  subjectKind: "role" | "user";
  subjectId: string;
  permissionKey: string;
  targetKind: PermissionTargetKind;
  targetId?: string | null;
  targetValue?: string | null;
  effect: GrantEffect;
}

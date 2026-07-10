import type {
  CapabilitySnapshot,
  PermissionCatalog,
} from "../types/permission-types";
import { api } from "./base";

export async function getNotebookCapabilities(id: string) {
  return await api.get<CapabilitySnapshot>(`/notebook/${id}/capabilities`);
}

export async function getPermissionCatalog() {
  return await api.get<PermissionCatalog>(`/permissions/catalog`);
}

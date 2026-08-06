import type { components } from "@/lib/api/generated/openapi-types";

type Schemas = components["schemas"];

// O Rust monomorfiza PaginatedResponse<T> por tipo (PaginatedResponse_AdminUserView etc, um
// schema por instanciação) — não existe um genérico gerado equivalente. A forma do envelope
// (data/total/page/limit/totalPages) é idêntica nos três, então mantém o genérico local.
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export type AdminChartData = Schemas["AdminChartData"];

export type AdminSystemStats = Schemas["AdminSystemStats"];

export type AdminUserView = Schemas["AdminUserView"];

export type AdminTeamView = Schemas["AdminTeamView"];

export type AdminNotebookView = Schemas["AdminNotebookView"];

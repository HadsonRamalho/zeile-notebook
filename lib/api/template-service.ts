import { createApi } from "./base";

const api = createApi("templates");

export type TemplateKind = "typst";

export interface Template {
  id: string;
  kind: TemplateKind;
  name: string;
  userId: string | null;
  teamId: string | null;
  sourceNotebookId: string | null;
  isPublic: boolean;
  latestVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateVersion {
  id: string;
  templateId: string;
  version: number;
  namedSources: Record<string, string>;
  note: string | null;
  createdAt: string;
}

export interface ResolvedTemplate extends Template {
  version: TemplateVersion | null;
}

export interface PublicTemplate {
  id: string;
  kind: TemplateKind;
  name: string;
  owner_name: string;
  latest_version: number;
  updated_at: string;
}

export interface CreateTemplateInput {
  kind: TemplateKind;
  name: string;
  teamId?: string;
  sourceNotebookId?: string;
}

export async function createTemplate(input: CreateTemplateInput) {
  return api.post<Template>("/template", input);
}

export async function publishTemplateVersion(
  templateId: string,
  namedSources: Record<string, string>,
  note?: string,
) {
  return api.post<TemplateVersion>(`/template/${templateId}/versions`, {
    namedSources,
    note,
  });
}

export async function getTemplate(templateId: string, version?: number) {
  const path =
    version === undefined
      ? `/template/${templateId}`
      : `/template/${templateId}?version=${version}`;
  return api.get<ResolvedTemplate>(path);
}

export async function listMyTemplates(teamId?: string) {
  const path = teamId ? `/template/all?teamId=${teamId}` : "/template/all";
  return api.get<Template[]>(path);
}

export async function listPublicTemplates(kind?: TemplateKind, query?: string) {
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  const q = query?.trim();
  if (q) params.set("q", q);
  const suffix = params.toString();
  return api.get<PublicTemplate[]>(
    suffix ? `/template/all/public?${suffix}` : "/template/all/public",
  );
}

export async function setTemplateVisibility(
  templateId: string,
  isPublic: boolean,
) {
  return api.patch<Template>(`/template/${templateId}/visibility`, {
    isPublic,
  });
}

export async function deleteTemplate(templateId: string) {
  return api.delete(`/template/${templateId}`);
}

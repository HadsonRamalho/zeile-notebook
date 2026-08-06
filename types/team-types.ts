import type z from "zod";
import type { components } from "@/lib/api/generated/openapi-types";
import type { getTeamFormSchema } from "../schemas/team-schemas";

type Schemas = components["schemas"];

export type Team = Schemas["Team"];

export type NewTeam = Schemas["NewTeam"];

// Sem createdAt: dois call sites montam um TeamRole no cliente (papel sintético
// de admin ao criar um time, snapshot de permissões calculado localmente) sem
// vir de resposta de rede, e createdAt não faz sentido nesses casos.
export type TeamRole = Omit<Schemas["TeamRoleView"], "createdAt">;

export type TeamMember = Schemas["TeamMember"];

export type TeamMemberWithUserData = Schemas["TeamMemberResponse"];

export type UpdateTeamRole = Schemas["UpdateTeamRole"];

export type NewTeamRoleRequest = Schemas["NewTeamRoleRequest"];

export type UpdateTeam = Schemas["UpdateTeam"];

export type InviteTeamMember = Schemas["InviteRequest"];

export interface TeamMemberWithRole {
  member: TeamMember;
  role: TeamRole;
}
export interface TeamWithUserRole {
  team: Team;
  role: TeamRole;
}
export interface TeamMemberWithRoleAndUserData {
  member: TeamMemberWithUserData;
  role: TeamRole;
}

export type TeamFormValues = z.infer<ReturnType<typeof getTeamFormSchema>>;

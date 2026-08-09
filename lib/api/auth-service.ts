import type { components } from "@/lib/api/generated/openapi-types";
import type { OAuthProviderSlug, User } from "@/types/user-types";
import { createResultApi } from "./base";

type Schemas = components["schemas"];

type ProvidersResponse = Omit<Schemas["ProvidersResponse"], "providers"> & {
  providers: OAuthProviderSlug[];
};

const api = createResultApi("auth");

export async function getProfile() {
  return api.get<User>("/user/me");
}

export async function getAuthProviders() {
  return api.get<ProvidersResponse>("/auth/providers");
}

import type { OAuthProviderSlug, User } from "@/types/user-types";
import { createResultApi } from "./base";

const api = createResultApi("auth");

export async function getProfile() {
  return api.get<User>("/user/me");
}

export async function getAuthProviders() {
  return api.get<{ providers: OAuthProviderSlug[] }>("/auth/providers");
}

import type {
  AuthMethods,
  OAuthProviderSlug,
  ProfileSecurityFormValues,
  UpdateUser,
} from "@/types/user-types";
import { createResultApi } from "./base";

const api = createResultApi("user");

export async function updateProfile(data: UpdateUser) {
  return api.patch("/user/update", data);
}

export async function deleteAccount() {
  return api.delete("/user");
}

export async function getAuthMethods() {
  return api.get<AuthMethods>("/user/auth/methods");
}

export async function startProviderLink(provider: OAuthProviderSlug) {
  return api.post<{ url: string }>(`/user/link/${provider}`, undefined, {
    credentials: "include",
  });
}

export async function unlinkProvider(provider: OAuthProviderSlug) {
  return api.delete<void>(`/user/link/${provider}`);
}

export async function updatePassword(data: ProfileSecurityFormValues) {
  return api.patch("/user/password", data);
}

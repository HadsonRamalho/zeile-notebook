import type {
  LoginUser,
  OAuthProviderSlug,
  RegisterUser,
  User,
} from "@/types/user-types";
import { createResultApi } from "./base";

const api = createResultApi("auth");

export async function login(data: LoginUser) {
  return api.post<string>("/user/login", data);
}

export async function register(data: RegisterUser) {
  return api.post<void>("/user/register", data);
}

export async function getProfile() {
  return api.get<User>("/user/me");
}

export async function getAuthProviders() {
  return api.get<{ providers: OAuthProviderSlug[] }>("/auth/providers");
}

import type { LoginUser, RegisterUser, User } from "../types/user-types";
import { createApi } from "./base";

const api = createApi("auth");

export async function login(data: LoginUser) {
  return api.post<string>("/user/login", data);
}

export async function register(data: RegisterUser) {
  return api.post<void>("/user/register", data);
}

export async function getProfile() {
  return api.get<User>("/user/me");
}

import type {
  ProfileSecurityFormValues,
  UpdateUser,
} from "../types/user-types";
import { createApi } from "./base";

const api = createApi("user");

export async function updateProfile(data: UpdateUser) {
  return api.patch("/user/update", data);
}

export async function deleteAccount() {
  return api.delete("/user");
}

export async function linkGithub() {
  return api.patch("/user/link/github");
}

export async function updatePassword(data: ProfileSecurityFormValues) {
  return api.patch("/user/password", data);
}

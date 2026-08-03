import type z from "zod";
import type {
  profilePasswordSchema,
  profileSchema,
} from "../schemas/user-schemas";

export type UserRole = "Admin" | "User";

export type AuthProvider = "Email" | "Google" | "Github";

export type OAuthProviderSlug = "github" | "google";

export interface AuthMethods {
  password: boolean;
  providers: OAuthProviderSlug[];
  primary_provider: AuthProvider;
}

export interface User {
  id: string;
  public_id: number;
  name: string;
  email: string;
  avatar_url: string | null;
  primary_provider: AuthProvider;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface UserAuthInfo {
  id: string;
  public_id: number;
  email: string;
  role: UserRole;
}

export interface LoginUser {
  email: string;
  password: string;
}

export interface UpdateUser {
  name: string;
  email: string;
}

export interface RegisterUser {
  name: string;
  email: string;
  password_hash: string;
}

export interface NewUserInternal {
  name: string;
  email: string;
  password_hash: string | null;
  primary_provider: AuthProvider;
  github_id: string | null;
  google_id: string | null;
  avatar_url: string | null;
}

export type ProfileFormValues = z.infer<typeof profileSchema>;

export type ProfileSecurityFormValues = z.infer<typeof profilePasswordSchema>;

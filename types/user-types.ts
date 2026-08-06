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
  primaryProvider: AuthProvider;
}

export interface User {
  id: string;
  publicId: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  primaryProvider: AuthProvider;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
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
  passwordHash: string;
}

export interface NewUserInternal {
  name: string;
  email: string;
  passwordHash: string | null;
  primaryProvider: AuthProvider;
  githubId: string | null;
  googleId: string | null;
  avatarUrl: string | null;
}

export type ProfileFormValues = z.infer<typeof profileSchema>;

export type ProfileSecurityFormValues = z.infer<typeof profilePasswordSchema>;

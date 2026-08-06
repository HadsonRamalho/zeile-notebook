import type z from "zod";
import type { components } from "@/lib/api/generated/openapi-types";
import type {
  profilePasswordSchema,
  profileSchema,
} from "../schemas/user-schemas";

type Schemas = components["schemas"];

export type UserRole = Schemas["UserRole"];

export type AuthProvider = Schemas["AuthProvider"];

// O slug de provedor OAuth ("github"/"google") não é um enum real no Rust:
// no limite HTTP (rota /user/link/{provider} e ProvidersResponse.providers)
// ele é só String. Fica local, não deriva de openapi-types.ts.
export type OAuthProviderSlug = "github" | "google";

export type AuthMethods = Omit<Schemas["AuthMethodsResponse"], "providers"> & {
  providers: OAuthProviderSlug[];
};

export type User = Schemas["User"];

export type LoginUser = Schemas["LoginUser"];

export type UpdateUser = Schemas["UpdateUser"];

export type RegisterUser = Pick<Schemas["NewUser"], "name" | "email"> & {
  passwordHash: string;
};

export type ProfileFormValues = z.infer<typeof profileSchema>;

export type ProfileSecurityFormValues = z.infer<typeof profilePasswordSchema>;

import type z from "zod";
import type {
  getExecuteResetSchema,
  getRequestResetSchema,
  loginSchema,
  signupSchema,
} from "../schemas/auth-schemas";

export type LoginFormValues = z.infer<typeof loginSchema>;

export type SignupFormValues = z.infer<typeof signupSchema>;

export type RequestResetFormValues = z.infer<
  ReturnType<typeof getRequestResetSchema>
>;

export type ExecuteResetFormValues = z.infer<
  ReturnType<typeof getExecuteResetSchema>
>;

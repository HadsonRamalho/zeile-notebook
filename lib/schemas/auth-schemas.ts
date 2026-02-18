import z from "zod";
import type { Translator } from "./translator";

export const loginSchema = z.object({
  email: z.email("Digite um e-mail válido"),
  password: z.string().min(1, "A senha é obrigatória"),
});

export const signupSchema = z
  .object({
    name: z.string().trim().min(2, "O nome deve ter pelo menos 2 caracteres"),
    email: z.email("Digite um e-mail válido"),
    password: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

export const getRequestResetSchema = (t: Translator) =>
  z.object({
    email: z.email(t("errors.invalid_email")),
  });

export const getExecuteResetSchema = (t: Translator) =>
  z
    .object({
      password: z.string().min(8, t("errors.min_length")),
      confirmPassword: z.string().min(8, t("errors.min_length")),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("errors.password_mismatch"),
      path: ["confirmPassword"],
    });

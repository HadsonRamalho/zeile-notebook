import * as z from "zod";

export const profileSchema = z.object({
  name: z.string().trim().min(2, "O nome deve ter pelo menos 2 caracteres."),
  email: z.email("Digite um e-mail válido."),
});

export const profilePasswordSchema = z
  .object({
    currentPassword: z.string(),
    newPassword: z.string().min(8, "A senha deve ter pelo menos 8 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });

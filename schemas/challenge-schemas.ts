import * as z from "zod";

const languageEnum = z.enum(["rust", "go", "cpp", "zig"]);
const judgeModeEnum = z.enum(["io", "reference", "property"]);

export const createChallengeSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2, "O slug deve ter pelo menos 2 caracteres")
    .regex(/^[a-z0-9-]+$/, "Use apenas letras minúsculas, números e hífens"),
  title: z.string().trim().min(2, "O título é obrigatório"),
  statementMd: z.string().trim().min(1, "O enunciado é obrigatório"),
  difficulty: z.string().optional(),
  tags: z.array(z.string()).optional(),
  languages: z.array(languageEnum).min(1, "Escolha ao menos uma linguagem"),
  judgeMode: judgeModeEnum.optional(),
  timeLimitMs: z.number().int().min(500).max(30000).optional(),
  memLimitKb: z.number().int().min(4096).max(2097152).optional(),
});

export const createTestCaseSchema = z.object({
  input: z.string(),
  expected: z.string().nullable().optional(),
  isHidden: z.boolean().optional(),
  weight: z.number().int().min(0).optional(),
  ord: z.number().int().optional(),
});

export const submitSchema = z.object({
  language: languageEnum,
  code: z.string().min(1, "O código não pode estar vazio"),
});

export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;
export type CreateTestCaseInput = z.infer<typeof createTestCaseSchema>;
export type SubmitInput = z.infer<typeof submitSchema>;

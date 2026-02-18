import z from "zod";
import type { Translator } from "./translator";

export const getTeamFormSchema = (t: Translator) =>
  z.object({
    name: z.string().min(2, t("invalid_team_name")),
    description: z.string().optional(),
  });

"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import { Separator } from "@/components/ui/separator";
import { useLocalStorage } from "@/hooks/use-local-storate";
import { BackButton } from "../back-button";

const settingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  autoSaveInterval: z.coerce.number(),
});

type SettingsValues = z.infer<typeof settingsSchema>;

export function SettingsForm() {
  const t = useTranslations("settings");
  const { setTheme, theme } = useTheme();

  const [autoSave, setAutoSave] = useLocalStorage<number>(
    "editor-autosave-interval",
    10000,
  );

  const form = useForm({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      theme: (theme as "light" | "dark" | "system") || "system",
      autoSaveInterval: autoSave ?? 10000,
    },
  });

  function onSubmit(data: SettingsValues) {
    setTheme(data.theme);
    setAutoSave(data.autoSaveInterval);
    toast.success(t("success_message"));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-2 text-center sm:text-left">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("title")}</h2>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-start justify-start">
          <BackButton />
        </div>
      </div>

      <Separator />

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-8 bg-card rounded-lg border p-6"
        >
          <div className="space-y-4">
            <h3 className="text-lg font-medium">{t("sections.editor")}</h3>
            <Separator />

            <div className="grid grid-cols-1 gap-4 md:grid-rows-2">
              <FormField
                control={form.control}
                name="autoSaveInterval"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex justify-between">
                      <FormLabel>{t("fields.autosave.label")}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={String(field.value)}
                        value={String(field.value)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="0">
                            {t("fields.autosave.options.off")}
                          </SelectItem>
                          <SelectItem value="5000">5s</SelectItem>
                          <SelectItem value="10000">10s</SelectItem>
                          <SelectItem value="30000">30s</SelectItem>
                          <SelectItem value="60000">1m</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <FormDescription>
                      {t("fields.autosave.description")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="theme"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex justify-between">
                      <FormLabel>{t("fields.theme.label")}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o tema" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="light">
                            {t("fields.theme.options.light")}
                          </SelectItem>
                          <SelectItem value="dark">
                            {t("fields.theme.options.dark")}
                          </SelectItem>
                          <SelectItem value="system">
                            {t("fields.theme.options.system")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit">
              <Save />
              {t("save_button")}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

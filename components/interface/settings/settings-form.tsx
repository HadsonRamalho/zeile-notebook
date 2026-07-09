"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Bell, BellOff, Palette, Save, SlidersHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/motion/tabs";
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
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useLocalStorage } from "@/hooks/use-local-storate";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import { BackButton } from "../back-button";

const settingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  editorFontSize: z.coerce.number(),
});

type SettingsValues = z.infer<typeof settingsSchema>;

export function SettingsForm() {
  const t = useTranslations("settings");
  const { setTheme, theme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const currentLocale = useLocale();
  const [activeTab, setActiveTab] = useState<"general" | "editor">("general");
  const pushSubscription = usePushSubscription();

  const [fontSize, setFontSize] = useLocalStorage<number>(
    "editor-font-size",
    14,
  );

  const form = useForm({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      theme: (theme as "light" | "dark" | "system") || "system",
      editorFontSize: fontSize ?? 14,
    },
  });

  function onSubmit(data: SettingsValues) {
    setTheme(data.theme);
    setFontSize(data.editorFontSize);
    toast.success(t("success_message"));
  }

  function onLocaleChange(newLocale: string) {
    if (newLocale === currentLocale) return;
    const rest = pathname.replace(/^\/(pt-br|en)(?=\/|$)/, "") || "/";
    router.replace(`/${newLocale}${rest === "/" ? "" : rest}`);
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
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as typeof activeTab)}
            variant="pill"
            className="w-full"
          >
            <TabsList className="w-fit">
              <TabsTrigger value="general" className="gap-2" indicatorClassName="bg-primary">
                <Palette size={16} />
                {t("tabs.general")}
              </TabsTrigger>
              <TabsTrigger value="editor" className="gap-2" indicatorClassName="bg-primary">
                <SlidersHorizontal size={16} />
                {t("tabs.editor")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="w-full">
              <div className="space-y-6 rounded-lg border bg-card p-6">
                <FormField
                  control={form.control}
                  name="theme"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                          <FormLabel>{t("fields.theme.label")}</FormLabel>
                          <FormDescription>
                            {t("fields.theme.description")}
                          </FormDescription>
                        </div>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="w-40">
                              <SelectValue />
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

                <Separator />

                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      {t("fields.language.label")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t("fields.language.description")}
                    </p>
                  </div>
                  <Select defaultValue={currentLocale} onValueChange={onLocaleChange}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt-br">Português</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {pushSubscription.isSupported && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium">
                          Notificações push
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {pushSubscription.permission === "denied"
                            ? "Bloqueadas nas configurações do navegador."
                            : "Receba um aviso quando alguém te mencionar no chat de um caderno."}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant={pushSubscription.isSubscribed ? "outline" : "default"}
                        disabled={
                          pushSubscription.isLoading ||
                          pushSubscription.permission === "denied"
                        }
                        onClick={() =>
                          pushSubscription.isSubscribed
                            ? pushSubscription.unsubscribe()
                            : pushSubscription.subscribe()
                        }
                      >
                        {pushSubscription.isSubscribed ? (
                          <>
                            <BellOff className="size-4" />
                            Desativar
                          </>
                        ) : (
                          <>
                            <Bell className="size-4" />
                            Ativar
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </TabsContent>

            <TabsContent value="editor" className="w-full">
              <div className="space-y-6 rounded-lg border bg-card p-6">
                <FormField
                  control={form.control}
                  name="editorFontSize"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                          <FormLabel>
                            {t("fields.editor_font_size.label")}
                          </FormLabel>
                          <FormDescription>
                            {t("fields.editor_font_size.description")}
                          </FormDescription>
                        </div>
                        <Select
                          onValueChange={(v) => field.onChange(Number(v))}
                          defaultValue={String(field.value)}
                        >
                          <FormControl>
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="12">12px</SelectItem>
                            <SelectItem value="13">13px</SelectItem>
                            <SelectItem value="14">14px</SelectItem>
                            <SelectItem value="16">16px</SelectItem>
                            <SelectItem value="18">18px</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </TabsContent>
          </Tabs>

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

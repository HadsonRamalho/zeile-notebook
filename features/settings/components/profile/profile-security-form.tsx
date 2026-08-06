"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, Save } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Loader } from "@/components/motion/loader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { updatePassword } from "@/lib/api/user-service";
import { profilePasswordSchema } from "@/schemas/user-schemas";
import type { ProfileSecurityFormValues } from "@/types/user-types";

export function ProfileSecurityForm() {
  const t = useTranslations("profile");

  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<ProfileSecurityFormValues>({
    resolver: zodResolver(profilePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    mode: "onChange",
  });

  async function onSubmit(data: ProfileSecurityFormValues) {
    setIsSaving(true);
    const result = await updatePassword(data);
    if (result.isErr()) {
      toast.error(
        result.error instanceof Error
          ? result.error.message
          : t("security_card.password_update_error"),
      );
    } else {
      toast.success(t("security_card.password_updated"));
    }
    setIsSaving(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-5" />
              {t("security_card.title")}
            </CardTitle>
            <CardDescription>{t("security_card.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("security_card.current_password")}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder={t("security_card.current_password")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("security_card.new_password")}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder={t("security_card.new_password")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("security_card.confirm_password")}</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder={t("security_card.confirm_password")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end border-t px-6 py-4">
            <Button
              type="submit"
              disabled={isSaving || !form.formState.isDirty}
            >
              {isSaving && (
                <Loader variant="spinner" size={16} className="mr-2" />
              )}
              {!isSaving && <Save className="mr-2 h-4 w-4" />}
              {t("security_card.update_password")}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}

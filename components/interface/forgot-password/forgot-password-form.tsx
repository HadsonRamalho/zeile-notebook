"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { BackButton } from "@/components/interface/back-button";
import { Loader } from "@/components/motion/loader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { createApi } from "@/lib/api/base";
import { handleApiError } from "@/lib/api/handle-api-error";
import { getRequestResetSchema } from "@/lib/schemas/auth-schemas";
import type { RequestResetFormValues } from "@/lib/types/auth-types";
import { cn } from "@/lib/utils";

const api = createApi("auth");

export function ForgotPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const t = useTranslations("forgot_password");
  const a = useTranslations("api_errors");
  const [error, setError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<RequestResetFormValues>({
    resolver: zodResolver(getRequestResetSchema(t)),
    defaultValues: {
      email: "",
    },
  });

  async function onSubmit(data: RequestResetFormValues) {
    setIsLoading(true);
    setError("");
    setIsSuccess(false);

    try {
      await api.post("/user/request-password-reset", data);
      setIsSuccess(true);
      toast.success(t("success_toast"));
    } catch (err: any) {
      handleApiError({ err, t: a, setError });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <div className="relative flex items-center justify-center w-full mb-2">
            <div className="absolute left-0">
              <BackButton showText={false} />
            </div>
            <CardTitle className="text-xl">{t("title")}</CardTitle>
          </div>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Erro</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {isSuccess ? (
              <div className="rounded-lg bg-emerald-500/10 p-4 text-center text-sm text-emerald-600 dark:text-emerald-400">
                {t("success_message")}
              </div>
            ) : (
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onSubmit)}
                  className="grid gap-6"
                >
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("email_label")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("email_placeholder")}
                            type="email"
                            disabled={isLoading}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full bg-secondary text-foreground"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader variant="spinner" size={16} className="mr-2" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    {t("submit_button")}
                  </Button>
                </form>
              </Form>
            )}

            <div className="text-center text-sm">
              <a href="/login" className="underline underline-offset-4">
                {t("back_to_login")}
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

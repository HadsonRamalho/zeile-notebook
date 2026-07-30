"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, KeyRound, Send } from "lucide-react";
import { Loader } from "@/components/motion/loader";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
import { getExecuteResetSchema } from "@/lib/schemas/auth-schemas";
import type { ExecuteResetFormValues } from "@/lib/types/auth-types";
import { cn } from "@/lib/utils";

const api = createApi("auth");

export function ResetPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const t = useTranslations("reset_password");
  const a = useTranslations("api_errors");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<ExecuteResetFormValues>({
    resolver: zodResolver(getExecuteResetSchema(t)),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(data: ExecuteResetFormValues) {
    if (!token) {
      setError(t("errors.missing_token"));
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      await api.post("/user/execute-password-reset", {
        token,
        new_password: data.password,
      });
      toast.success(t("success_toast"));
      router.push("/login");
    } catch (err: any) {
      handleApiError({ err, t: a, setError });
    } finally {
      setIsLoading(false);
    }
  }

  if (!token) {
    return (
      <Card className="w-full max-w-md mx-auto mt-12">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-destructive">
            {t("errors.invalid_link_title")}
          </CardTitle>
          <CardDescription>{t("errors.invalid_link_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => router.push("/forgot-password")}
          >
            <Send className="mr-2 h-4 w-4" />
            {t("request_new_link")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t("title")}</CardTitle>
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

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid gap-6"
              >
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("new_password_label")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("new_password_placeholder")}
                          type="password"
                          disabled={isLoading}
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
                      <FormLabel>{t("confirm_password_label")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("confirm_password_placeholder")}
                          type="password"
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
                    <KeyRound className="mr-2 h-4 w-4" />
                  )}
                  {t("submit_button")}
                </Button>
              </form>
            </Form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

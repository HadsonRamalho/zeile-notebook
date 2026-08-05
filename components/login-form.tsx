"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, LogIn } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
import { useAuth } from "@/context/auth-context";
import { getAuthProviders } from "@/lib/api/auth-service";
import { handleApiError } from "@/lib/api/handle-api-error";
import {
  type AccountType,
  isDesktopRuntime,
  resolve,
} from "@/lib/runtime/router";
import { loginSchema } from "@/lib/schemas/auth-schemas";
import type { LoginFormValues } from "@/lib/types/auth-types";
import type { OAuthProviderSlug } from "@/lib/types/user-types";
import { cn } from "@/lib/utils";
import { GithubIcon } from "./icons/github-icon";
import { GoogleIcon } from "./icons/google-icon";
import { BackButton } from "./interface/back-button";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { signIn, account } = useAuth();
  const t = useTranslations("login");
  const a = useTranslations("api_errors");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("cloud");
  const [providers, setProviders] = useState<OAuthProviderSlug[]>([]);
  const searchParams = useSearchParams();
  const authError = searchParams.get("auth_error");

  useEffect(() => {
    if (isDesktopRuntime()) {
      setIsDesktop(true);
      setAccountType(account);
    }
  }, [account]);

  useEffect(() => {
    getAuthProviders()
      .then((resposta) => setProviders(resposta.providers))
      .catch(() => setProviders([]));
  }, []);

  const handleOAuthLogin = (provider: OAuthProviderSlug) => {
    const redirectUrl = `${resolve("auth", accountType).baseUrl}/user/login/${provider}`;
    window.location.href = redirectUrl;
  };

  const handleAuthError = (e: string) => {
    const errorKey = `errors.${e}`;
    const message = t(errorKey, {
      defaultValue: t("login.errors.generic_github_error"),
    });

    setError(message);
    toast.error(message);
  };

  useEffect(() => {
    if (authError) {
      handleAuthError(authError);
    }
  }, [authError]);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(data: LoginFormValues) {
    setIsLoading(true);
    setError("");

    try {
      await signIn(data, isDesktop ? accountType : undefined);
    } catch (err: unknown) {
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
            {isDesktop && (
              <div className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1">
                <Button
                  type="button"
                  size="sm"
                  variant={accountType === "cloud" ? "secondary" : "ghost"}
                  onClick={() => setAccountType("cloud")}
                >
                  {t("account_cloud")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={accountType === "local" ? "secondary" : "ghost"}
                  onClick={() => setAccountType("local")}
                >
                  {t("account_local")}
                </Button>
              </div>
            )}

            {accountType === "cloud" && providers.length > 0 && (
              <>
                <div className="flex flex-col gap-4">
                  {providers.includes("github") && (
                    <Button
                      variant="outline"
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleOAuthLogin("github")}
                    >
                      <GithubIcon />
                      {t("github_button")}
                    </Button>
                  )}

                  {providers.includes("google") && (
                    <Button
                      variant="outline"
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleOAuthLogin("google")}
                    >
                      <GoogleIcon />
                      {t("google_button")}
                    </Button>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      {t("divider")}
                    </span>
                  </div>
                </div>
              </>
            )}

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
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
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

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center">
                        <FormLabel>{t("password_label")}</FormLabel>
                        <Link
                          href="/forgot-password"
                          className="ml-auto text-sm underline-offset-4 hover:underline"
                        >
                          {t("forgot_password")}
                        </Link>
                      </div>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder={t("password_label")}
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
                    <LogIn className="mr-2 h-4 w-4" />
                  )}
                  {t("submit_button")}
                </Button>
              </form>
            </Form>

            <div className="text-center text-sm">
              {t("no_account")}{" "}
              <a href="/signup" className="underline underline-offset-4">
                {t("signup_link")}
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
        {t.rich("terms", {
          link1: (chunks) => <a href="/terms">{chunks}</a>,
          link2: (chunks) => <a href="/privacy">{chunks}</a>,
        })}
      </div>
    </div>
  );
}

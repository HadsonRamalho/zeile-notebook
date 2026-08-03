"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, UserPlus } from "lucide-react";
import { Loader } from "@/components/motion/loader";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
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
import { type AccountType, isDesktopRuntime } from "@/lib/runtime/router";
import { signupSchema } from "@/lib/schemas/auth-schemas";
import type { SignupFormValues } from "@/lib/types/auth-types";
import { cn } from "@/lib/utils";
import { BackButton } from "./interface/back-button";

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const t = useTranslations("signup");
  const { register, account } = useAuth();
  const [globalError, setGlobalError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("cloud");

  useEffect(() => {
    if (isDesktopRuntime()) {
      setIsDesktop(true);
      setAccountType(account);
    }
  }, [account]);

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(data: SignupFormValues) {
    setIsLoading(true);
    setGlobalError("");

    try {
      await register(
        { ...data, passwordHash: data.password },
        isDesktop ? accountType : undefined,
      );
    } catch (err: any) {
      setGlobalError(err.message || t("errors.default"));
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

            {globalError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t("errors.title")}</AlertTitle>
                <AlertDescription>{globalError}</AlertDescription>
              </Alert>
            )}

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="grid gap-4"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.name")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t("fields.namePlaceholder")}
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
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("fields.email")}</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder={t("fields.emailPlaceholder")}
                          disabled={isLoading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("fields.password")}</FormLabel>
                        <FormControl>
                          <Input
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
                        <FormLabel>{t("fields.confirmPassword")}</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            disabled={isLoading}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="text-[0.8rem] text-muted-foreground">
                  {t("hints.passwordLength")}
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <Loader variant="spinner" size={16} className="mr-2" />
                  ) : (
                    <UserPlus className="mr-2 h-4 w-4" />
                  )}
                  {t("buttons.submit")}
                </Button>
              </form>
            </Form>

            <div className="text-center text-sm">
              {t("footer.hasAccount")}{" "}
              <Link href="/login" className="underline underline-offset-4">
                {t("footer.loginLink")}
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
        {t.rich("footer.terms", {
          link1: (chunks) => <a href="/terms">{chunks}</a>,
          link2: (chunks) => <a href="/privacy">{chunks}</a>,
        })}
      </div>
    </div>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect } from "react";
import { HelixPercentLoader } from "@/components/motion/helix-percent-loader";
import { useAuth } from "@/context/auth-context";

function AuthContent() {
  const t = useTranslations("login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { githubSignIn } = useAuth();
  const token = searchParams.get("token");
  const refreshToken = searchParams.get("refresh");
  const error = searchParams.get("error") || searchParams.get("auth_error");

  useEffect(() => {
    if (token) {
      githubSignIn(token, refreshToken ?? undefined);
      return;
    }
    if (error) {
      router.push(`/login?auth_error=${error}`);
      return;
    }
    if (!token) {
      router.push("/login?auth_error=auth_failed");
      return;
    }
  }, [token, refreshToken, error, router, githubSignIn]);

  return (
    <div className="flex h-screen w-full items-center justify-center flex-col gap-4">
      <HelixPercentLoader label={t("authenticating")} />
      <p className="text-muted-foreground animate-pulse">
        {t("authenticating")}...
      </p>
    </div>
  );
}

export default function AuthCallbackPage() {
  const tLoading = useTranslations();
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center flex-col gap-4">
          <HelixPercentLoader label={tLoading("loading")} />
          <p className="text-muted-foreground animate-pulse">
            {tLoading("loading")}
          </p>
        </div>
      }
    >
      <AuthContent />
    </Suspense>
  );
}

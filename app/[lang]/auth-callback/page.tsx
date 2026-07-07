"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { HelixPercentLoader } from "@/components/motion/helix-percent-loader";
import { useAuth } from "@/context/auth-context";

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { githubSignIn } = useAuth();
  const token = searchParams.get("token");
  const error = searchParams.get("error") || searchParams.get("auth_error");

  useEffect(() => {
    if (token) {
      githubSignIn(token);
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
  }, [token]);

  return (
    <div className="flex h-screen w-full items-center justify-center flex-col gap-4">
      <HelixPercentLoader label="Autenticando" />
      <p className="text-muted-foreground animate-pulse">Autenticando...</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center flex-col gap-4">
          <HelixPercentLoader label="Carregando" />
          <p className="text-muted-foreground animate-pulse">Carregando...</p>
        </div>
      }
    >
      <AuthContent />
    </Suspense>
  );
}

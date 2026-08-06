"use client";

import { CheckCircle2, Home, XCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { HelixPercentLoader } from "@/components/motion/helix-percent-loader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { acceptTeamInvite } from "@/lib/api/teams-service";

function InviteProcessor() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (isAuthLoading) return;

    if (!token) {
      setStatus("error");
      setErrorMessage("Nenhum código de convite encontrado na URL.");
      return;
    }

    if (!user) {
      const currentUrl = encodeURIComponent(`/invite?token=${token}`);
      router.push(`/login?callbackUrl=${currentUrl}`);
      return;
    }

    const processInvite = async () => {
      const result = await acceptTeamInvite(token);
      if (result.isErr()) {
        setStatus("error");
        setErrorMessage(
          result.error instanceof Error
            ? result.error.message
            : "Este convite é inválido ou já foi utilizado.",
        );
        return;
      }
      setStatus("success");
      setTimeout(() => {
        router.push("/docs");
      }, 3000);
    };

    processInvite();
  }, [token, user, isAuthLoading, router]);

  if (status === "loading" || isAuthLoading) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4">
        <HelixPercentLoader label="Processando convite" />
        <p className="text-muted-foreground animate-pulse">
          Processando seu convite...
        </p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 text-center">
        <CheckCircle2 className="h-16 w-16 text-emerald-500" />
        <h2 className="text-2xl font-bold">Convite Aceito!</h2>
        <p className="text-muted-foreground">
          Você foi adicionado à equipe com sucesso. Redirecionando...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-4 text-center">
      <XCircle className="h-16 w-16 text-destructive" />
      <h2 className="text-2xl font-bold">Convite Inválido</h2>
      <p className="text-muted-foreground">{errorMessage}</p>
      <Button onClick={() => router.push("/docs")}>
        <Home className="mr-2 h-4 w-4" />
        Ir para o Início
      </Button>
    </div>
  );
}

export default function InvitePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center space-y-4">
            <HelixPercentLoader label="Carregando" />
            <p className="text-muted-foreground">Carregando...</p>
          </div>
        }
      >
        <div className="w-full max-w-md p-8 border border-border rounded-xl bg-card shadow-lg">
          <InviteProcessor />
        </div>
      </Suspense>
    </div>
  );
}

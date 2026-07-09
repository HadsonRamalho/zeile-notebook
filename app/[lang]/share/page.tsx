"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { HelixPercentLoader } from "@/components/motion/helix-percent-loader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { createNotebook } from "@/lib/api/notebook-service";
import { setPendingImport } from "@/lib/pendingImport";

function buildSharedContent(
  title: string | null,
  text: string | null,
  url: string | null,
): string {
  const parts: string[] = [];
  if (title) parts.push(`# ${title}`);
  if (text) parts.push(text);
  if (url) parts.push(url);
  return parts.join("\n\n").trim();
}

function ShareProcessor() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthLoading) return;

    if (!user) {
      const currentUrl = encodeURIComponent(
        `/share?${searchParams.toString()}`,
      );
      router.push(`/login?callbackUrl=${currentUrl}`);
      return;
    }

    const content = buildSharedContent(
      searchParams.get("title"),
      searchParams.get("text"),
      searchParams.get("url"),
    );

    if (!content) {
      setErrorMessage("Nada para compartilhar foi recebido.");
      return;
    }

    createNotebook()
      .then((id) => {
        setPendingImport(content);
        router.replace(`/notebook/${id}`);
      })
      .catch(() => {
        setErrorMessage("Não foi possível criar um caderno com o conteúdo compartilhado.");
      });
  }, [isAuthLoading, user, searchParams, router]);

  if (errorMessage) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 text-center">
        <p className="text-destructive">{errorMessage}</p>
        <Button onClick={() => router.push("/notebook")}>
          Ir para meus cadernos
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <HelixPercentLoader label="Importando conteúdo compartilhado" />
      <p className="text-muted-foreground animate-pulse">
        Criando um novo caderno...
      </p>
    </div>
  );
}

export default function SharePage() {
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
        <ShareProcessor />
      </Suspense>
    </div>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useState } from "react";
import { HelixPercentLoader } from "@/components/motion/helix-percent-loader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { setPendingImport } from "@/features/notebook/lib/pending-import";
import { createNotebook } from "@/lib/api/notebook-service";

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
  const t = useTranslations("share");
  const d = useTranslations("notebook_defaults");

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
      setErrorMessage(t("nothing_shared"));
      return;
    }

    createNotebook({
      title: d("title"),
      blockTitle: d("block_title"),
      blockContent: d("block_content"),
    }).then((result) => {
      if (result.isErr()) {
        setErrorMessage(t("create_error"));
      } else {
        setPendingImport(content);
        router.replace(`/notebook/${result.data}`);
      }
    });
  }, [isAuthLoading, user, searchParams, router, t, d]);

  if (errorMessage) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 text-center">
        <p className="text-destructive">{errorMessage}</p>
        <Button onClick={() => router.push("/notebook")}>
          {t("back_to_notebooks")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-4">
      <HelixPercentLoader label={t("importing_shared_content")} />
      <p className="text-muted-foreground animate-pulse">
        {t("creating_notebook")}
      </p>
    </div>
  );
}

export default function SharePage() {
  const t = useTranslations("share");
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center space-y-4">
            <HelixPercentLoader label={t("loading")} />
            <p className="text-muted-foreground">{t("loading_ellipsis")}</p>
          </div>
        }
      >
        <ShareProcessor />
      </Suspense>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { HelixPercentLoader } from "@/components/motion/helix-percent-loader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { setPendingImport } from "@/features/notebook/lib/pending-import";
import { createNotebook } from "@/lib/api/notebook-service";

interface FileSystemFileHandleLike {
  getFile: () => Promise<File>;
}

interface LaunchParamsLike {
  files: FileSystemFileHandleLike[];
}

interface LaunchQueueLike {
  setConsumer: (consumer: (params: LaunchParamsLike) => void) => void;
}

declare global {
  interface Window {
    launchQueue?: LaunchQueueLike;
  }
}

export default function OpenFilePage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasHandledLaunch = useRef(false);
  const t = useTranslations("open_file");
  const d = useTranslations("notebook_defaults");

  const importFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const id = await createNotebook({
          title: d("title"),
          blockTitle: d("block_title"),
          blockContent: d("block_content"),
        });
        setPendingImport(text);
        router.replace(`/notebook/${id}`);
      } catch {
        setErrorMessage(t("error_message"));
      }
    },
    [router, t, d],
  );

  useEffect(() => {
    if (isAuthLoading) return;

    if (!user) {
      router.push(`/login?callbackUrl=${encodeURIComponent("/open-file")}`);
      return;
    }

    if (!window.launchQueue) return;

    window.launchQueue.setConsumer(async (launchParams) => {
      if (hasHandledLaunch.current) return;
      const fileHandle = launchParams.files[0];
      if (!fileHandle) return;
      hasHandledLaunch.current = true;
      const file = await fileHandle.getFile();
      await importFile(file);
    });
  }, [isAuthLoading, user, router, importFile]);

  const handleManualPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) importFile(file);
  };

  if (errorMessage) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center space-y-4 bg-background p-4 text-center">
        <p className="text-destructive">{errorMessage}</p>
        <Button onClick={() => router.push("/notebook")}>
          {t("back_to_notebooks")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center space-y-4 bg-background p-4">
      <HelixPercentLoader label={t("opening_file")} />
      <p className="text-muted-foreground animate-pulse">
        {t("importing_markdown")}
      </p>
      <input
        type="file"
        accept=".md,.markdown,text/markdown"
        onChange={handleManualPick}
        className="text-sm text-muted-foreground"
      />
    </div>
  );
}

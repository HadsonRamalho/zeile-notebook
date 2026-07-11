"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/auth-context";
import { getUserNotebookPermissions } from "@/lib/api/notebook-service";
import type { TeamRole } from "@/lib/types/team-types";
import { useNotebook } from "./notebook-context";
import { ControlActions } from "./notebook-controls-actions";
import { PublicNotebookPermissions } from "./permissions/public-notebook-permissions";

type ControlRules = {
  showPrivacySelector: boolean;
  showClone: boolean;
  showShare: boolean;
  showExport: boolean;
};

export function NotebookControls() {
  const { user } = useAuth();
  const {
    handleToggleVisibility,
    notebook,
    isPublic,
    triggerClone,
    isCloning,
  } = useNotebook();
  const [permissions, setPermissions] = useState<TeamRole | undefined>(
    undefined,
  );

  const loadPermissions = async () => {
    if (notebook) {
      const data = await getUserNotebookPermissions(notebook?.id);
      setPermissions(data);
    }
  };

  useEffect(() => {
    loadPermissions();
  }, [notebook]);

  const handleShare = async () => {
    const url = window.location.href;
    const title = document.title || "Zeile Notebook";
    const text = "Confira este caderno colaborativo no Zeile!";

    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent,
      );

    const copyToClipboard = async () => {
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado para a área de transferência!");
      } catch (err) {
        toast.error("Não foi possível copiar o link.");
      }
    };

    if (isMobile && navigator.share) {
      try {
        await navigator.share({
          title,
          text,
          url,
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          await copyToClipboard();
        }
      }
    } else {
      await copyToClipboard();
    }
  };

  const rules: ControlRules = {
    showPrivacySelector: !!permissions?.can_manage_privacy,
    showClone: !!user,
    showShare: true,
    showExport: true,
  };

  return (
    <div className="flex w-full justify-start gap-2 print:hidden">
      <ControlActions
        rules={rules}
        isPublic={isPublic}
        isCloning={isCloning}
        onToggleVisibility={handleToggleVisibility}
        onClone={triggerClone}
        onShare={handleShare}
        onExport={() => window.print()}
      />
      {isPublic && notebook && (
        <PublicNotebookPermissions notebookId={notebook.id} />
      )}
    </div>
  );
}

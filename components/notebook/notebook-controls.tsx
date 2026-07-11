"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/auth-context";
import { getNotebookMeta, type NotebookMeta } from "@/lib/api/notebook-service";
import { useNotebook } from "./notebook-context";
import { ControlActions } from "./notebook-controls-actions";
import { useCan } from "./permissions/capabilities";
import { PublicNotebookPermissions } from "./permissions/public-notebook-permissions";
import { TeamNotebookPermissions } from "./permissions/team-notebook-permissions";

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
  const [meta, setMeta] = useState<NotebookMeta | null>(null);

  useEffect(() => {
    if (!notebook?.id) return;
    let active = true;
    getNotebookMeta(notebook.id)
      .then((m) => active && setMeta(m))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [notebook?.id]);

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

  const can = useCan();

  const rules: ControlRules = {
    showPrivacySelector: can("notebook.manage_privacy"),
    showClone: !!user,
    showShare: true,
    showExport: true,
  };

  return (
    <div className="flex w-full flex-wrap justify-start gap-2 print:hidden">
      <ControlActions
        rules={rules}
        isPublic={isPublic}
        isCloning={isCloning}
        onToggleVisibility={handleToggleVisibility}
        onClone={triggerClone}
        onShare={handleShare}
        onExport={() => window.print()}
      />
      {isPublic && notebook && meta && !meta.team_id && (
        <PublicNotebookPermissions notebookId={notebook.id} />
      )}
      {notebook && meta?.team_id && can("team.roles.edit_role_permissions") && (
        <TeamNotebookPermissions
          notebookId={notebook.id}
          teamId={meta.team_id}
        />
      )}
    </div>
  );
}

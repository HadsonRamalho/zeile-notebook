"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/context/auth-context";
import {
  EXPORT_PERMISSION,
  type ExportFormat,
  exportNotebook,
} from "@/features/notebook/lib/export";
import { getNotebookMeta } from "@/lib/api/notebook-service";
import type { NotebookMeta } from "@/types/notebook-types";
import { useNotebook } from "../context/notebook-context";
import { ExportMenu, type ExportOption } from "./export-menu";
import { ControlActions, type ControlRules } from "./notebook-controls-actions";
import { useCan } from "./permissions/capabilities";
import { PublicNotebookPermissions } from "./permissions/public-notebook-permissions";
import { TeamNotebookPermissions } from "./permissions/team-notebook-permissions";

const EXPORT_FORMATS: { format: ExportFormat; labelKey: string }[] = [
  { format: "markdown", labelKey: "export_markdown" },
  { format: "markdown_assets", labelKey: "export_markdown_assets" },
  { format: "pdf", labelKey: "export_pdf" },
  { format: "json", labelKey: "export_json" },
  { format: "json_assets", labelKey: "export_json_assets" },
];

export function NotebookControls() {
  const { user } = useAuth();
  const {
    handleToggleVisibility,
    notebook,
    liveNotebook,
    isPublic,
    triggerClone,
    isCloning,
    setPresenting,
  } = useNotebook();
  const [meta, setMeta] = useState<NotebookMeta | null>(null);
  const [publicPermsOpen, setPublicPermsOpen] = useState(false);
  const [teamPermsOpen, setTeamPermsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const t = useTranslations("notebook_controls");
  const tPresent = useTranslations("presentation");

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
    const url =
      isPublic && meta?.publicSlug
        ? `${window.location.origin}/p/${meta.publicSlug}`
        : window.location.href;
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
      } catch (_err) {
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

  const exportOptions: ExportOption[] = EXPORT_FORMATS.filter((f) =>
    can(EXPORT_PERMISSION[f.format]),
  ).map((f) => ({ format: f.format, label: t(f.labelKey) }));

  const exportBase = notebook ?? liveNotebook;
  const exportSource = exportBase
    ? {
        ...exportBase,
        title: liveNotebook?.title || notebook?.title || exportBase.title,
        blocks: liveNotebook?.blocks ?? notebook?.blocks ?? [],
      }
    : null;

  const handleExport = async (format: ExportFormat) => {
    if (!exportSource || isExporting) return;
    setIsExporting(true);
    const toastId = toast.loading(t("exporting"));
    try {
      await exportNotebook(exportSource, format);
      toast.success(t("export_done"), { id: toastId });
    } catch {
      toast.error(t("export_error"), { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  const rules: ControlRules = {
    showPrivacySelector: can("notebook.manage_privacy"),
    showClone: !!user,
    showShare: true,
    showExport: exportOptions.length > 0,
    showPublicPerms: isPublic && can("notebook.manage_public"),
    showTeamPerms: !!meta?.teamId && can("team.roles.edit_role_permissions"),
    showPresent: true,
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
        onPresent={() => setPresenting(true)}
        presentLabel={tPresent("present")}
        exportMenu={
          <ExportMenu
            options={exportOptions}
            busy={isExporting}
            triggerLabel={t("export")}
            onExport={handleExport}
          />
        }
        onManagePublic={() => setPublicPermsOpen(true)}
        onManageTeamPerms={() => setTeamPermsOpen(true)}
      />
      {notebook && rules.showPublicPerms && (
        <PublicNotebookPermissions
          notebookId={notebook.id}
          open={publicPermsOpen}
          onOpenChange={setPublicPermsOpen}
        />
      )}
      {notebook && meta?.teamId && rules.showTeamPerms && (
        <TeamNotebookPermissions
          notebookId={notebook.id}
          teamId={meta.teamId}
          open={teamPermsOpen}
          onOpenChange={setTeamPermsOpen}
        />
      )}
    </div>
  );
}

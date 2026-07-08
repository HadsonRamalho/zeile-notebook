"use client";

import { Download, Settings, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotebookManager } from "./notebook/notebook-manager";

export function SidebarBackup() {
  const t = useTranslations("sidebar");
  const { downloadBackup, uploadBackup } = useNotebookManager();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (
        confirm(
          "Isso substituirá todas as suas notas atuais. Deseja continuar?",
        )
      ) {
        uploadBackup(file);
      }
      e.target.value = "";
    }
  };

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json"
        className="hidden"
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-accent-foreground"
            title={t("backup_title")}
            aria-label={t("backup_title")}
          >
            <Settings size={17} />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>{t("manage_data")}</DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => downloadBackup()} className="cursor-pointer">
            <Download className="mr-2 h-4 w-4" />
            <span>{t("download_all")}</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer"
          >
            <Upload className="mr-2 h-4 w-4" />
            <span>{t("import")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

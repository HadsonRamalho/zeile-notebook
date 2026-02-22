"use client";

import { Plus, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { SidebarBackup } from "../sidebar-backup";
import { useNotebookManager } from "./notebook-manager";
import { PageSidebar } from "./page/page-sidebar";

export function UserSidebar() {
  const t = useTranslations("sidebar");
  const { user } = useAuth();
  const { pages, createPage } = useNotebookManager();
  const [editingId, setEditingId] = useState<string | null>(null);
  const { renamePage, refreshPages } = useNotebookManager();

  useEffect(() => {
    if (user) {
      refreshPages();
    }
  }, [user]);

  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 mb-4 pb-4 border-b border-white/10">
      <div className="flex items-center justify-between px-2">
        <span className="text-xs font-bold uppercase">{t("my_notebook")}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
            onClick={refreshPages}
          >
            <RotateCw size={14} />
          </button>

          <div className="w-px h-3 bg-white/10 mx-1" />

          <SidebarBackup />

          <div className="w-px h-3 bg-white/10 mx-1" />

          <button
            type="button"
            onClick={createPage}
            className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
            title={t("new_page")}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-2">
        {pages.length === 0 && (
          <span className="px-2 text-xs text-muted-foreground italic">
            {t("no_pages")}
          </span>
        )}

        {pages.map((page) => (
          <div key={page.id}>
            <PageSidebar
              editingId={editingId}
              setEditingId={setEditingId}
              page={page}
              renamePage={renamePage}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

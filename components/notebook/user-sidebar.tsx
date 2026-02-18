"use client";

import { Check, FileText, Pencil, Plus, RotateCw } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import type { NotebookMeta } from "@/lib/types";
import { DeletePageDialog } from "../delete-page-dialog";
import { SidebarBackup } from "../sidebar-backup";
import { Button } from "../ui/button";
import { useNotebookManager } from "./notebook-manager";

export function UserSidebar() {
  const t = useTranslations("sidebar");
  const { user } = useAuth();
  const { pages, createPage } = useNotebookManager();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempTitle, setTempTitle] = useState("");
  const { renamePage, refreshPages } = useNotebookManager();

  const router = useRouter();
  const pathname = usePathname();

  const handleStartEditing = (page: NotebookMeta) => {
    setEditingId(page.id);
    setTempTitle(page.title);
  };

  const handleSaveRename = async (id: string) => {
    if (tempTitle.trim() !== "") {
      await renamePage(id, tempTitle);
    }
    setEditingId(null);
  };

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
          <div
            key={page.id}
            className=" w-full group flex items-center justify-between bg-card rounded-md pr-1"
          >
            {editingId === page.id ? (
              <div className="flex items-center gap-1 p-1 w-full">
                <input
                  className="bg-transparent border-b border-emerald-500 outline-none text-sm text-foreground w-full px-1"
                  value={tempTitle}
                  onChange={(e) => setTempTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveRename(page.id);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleSaveRename(page.id)}
                  className="text-emerald-500"
                >
                  <Check size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between w-full group">
                <Button
                  onClick={() => router.push(`/docs/${page.id}`)}
                  className={`flex-1 justify-start gap-2 p-2 w-full bg-card hover:bg-muted group-hover:bg-muted hover:cursor-pointer ${
                    pathname === `/docs/${page.id}`
                      ? "text-sidebar-primary font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  <FileText size={14} />
                  <span className="truncate max-w-30">{page.title}</span>
                </Button>

                <div className="flex items-center md:opacity-0 group-hover:opacity-100 transition-opacity bg-card p-1 rounded-md">
                  <button
                    type="button"
                    onClick={() => handleStartEditing(page)}
                    className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:cursor-pointer"
                  >
                    <Pencil size={12} />
                  </button>
                  <DeletePageDialog pageId={page.id} pageTitle={page.title} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

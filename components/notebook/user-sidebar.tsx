"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { SidebarBackup } from "../sidebar-backup";
import { useNotebookManager } from "./notebook-manager";
import { PageSidebar } from "./page/page-sidebar";

const ITEMS_PER_PAGE = 6;

export function UserSidebar() {
  const t = useTranslations("sidebar");
  const { user } = useAuth();
  const { pages, createPage, renamePage, refreshPages } = useNotebookManager();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const maxPage = Math.ceil(pages.length / ITEMS_PER_PAGE);
    if (currentPage > maxPage && maxPage > 0) {
      setCurrentPage(maxPage);
    }
  }, [pages.length, currentPage]);

  useEffect(() => {
    const id = setInterval(refreshPages, 6000);
    return () => clearInterval(id);
  }, [refreshPages]);

  if (!user) {
    return null;
  }

  const totalPages = Math.ceil(pages.length / ITEMS_PER_PAGE);
  const paginatedPages = pages.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const handleCreatePage = () => {
    createPage();
    setCurrentPage(1);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-2">
        <span className="text-xs font-bold uppercase">{t("my_notebook")}</span>
        <div className="flex items-center gap-1">

          <SidebarBackup />

          <div className="w-px h-3 bg-border mx-1" />

          <button
            type="button"
            onClick={handleCreatePage}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
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

        {paginatedPages.map((page) => (
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 pt-1">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
          >
            <ChevronLeft size={16} />
          </button>

          <span className="text-xs text-muted-foreground font-medium">
            {currentPage} / {totalPages}
          </span>

          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

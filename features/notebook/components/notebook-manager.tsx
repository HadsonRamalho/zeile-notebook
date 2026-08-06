"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useAuth } from "@/context/auth-context";
import { handleApiError } from "@/lib/api/handle-api-error";
import {
  cloneNotebook,
  createNotebook,
  deleteNotebook,
  getMyNotebooks,
  updateNotebookTitle,
  updateNotebookVisibility,
} from "@/lib/api/notebook-service";
import { restoreFullBackup } from "@/lib/storage";
import type { NotebookMeta } from "@/types/notebook-types";

interface NotebookManagerType {
  pages: NotebookMeta[];
  createPage: () => void;
  deletePage: (id: string) => void;
  refreshPages: () => void;
  downloadBackup: () => Promise<void>;
  uploadBackup: (file: File) => Promise<void>;
  renamePage: (id: string, newTitle: string) => Promise<void>;
  clone: (id: string) => Promise<void>;
  updateVisibility: (id: string, visible: boolean) => Promise<void>;
}

const NotebookManagerContext = createContext<NotebookManagerType | undefined>(
  undefined,
);

export function NotebookManagerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("api_errors");
  const d = useTranslations("notebook_defaults");
  const [pages, setPages] = useState<NotebookMeta[]>([]);
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const refreshPages = useCallback(async () => {
    if (!user) {
      return;
    }
    const result = await getMyNotebooks();
    if (result.isErr()) {
      console.error("Failed to refresh pages:", result.error);
      return;
    }
    setPages(result.data);
  }, [user]);

  useEffect(() => {
    refreshPages();
  }, [refreshPages]);

  const renamePage = useCallback(
    async (id: string, newTitle: string) => {
      if (!user) {
        return;
      }
      if (!newTitle.trim()) return;

      const result = await updateNotebookTitle(id, newTitle);
      if (result.isErr()) {
        handleApiError({ err: result.error, t });
        return;
      }
      window.dispatchEvent(
        new CustomEvent("notebook-title-updated", {
          detail: { id, title: newTitle },
        }),
      );
      await refreshPages();
    },
    [user, refreshPages, t],
  );

  const createPage = useCallback(async () => {
    if (!user) {
      return;
    }
    const result = await createNotebook({
      title: d("title"),
      blockTitle: d("block_title"),
      blockContent: d("block_content"),
    });
    if (result.isErr()) {
      handleApiError({ err: result.error, t });
      return;
    }
    await refreshPages();
    router.push(`/notebook/${result.data}`);
  }, [user, refreshPages, router, t, d]);

  const clone = useCallback(
    async (id: string) => {
      if (!user) {
        return;
      }
      const original = pages.find((p) => p.id === id);
      const title = d("clone_title", {
        title: original?.title ?? d("title"),
      });
      const result = await cloneNotebook(id, title);
      if (result.isErr()) {
        handleApiError({ err: result.error, t });
        return;
      }
      await refreshPages();
      router.push(`/notebook/${result.data}`);
    },
    [user, pages, refreshPages, router, t, d],
  );

  const updateVisibility = useCallback(
    async (id: string, isVisible: boolean) => {
      if (!user) {
        return;
      }
      const result = await updateNotebookVisibility(id, isVisible);
      if (result.isErr()) {
        handleApiError({ err: result.error, t });
        return;
      }
      await refreshPages();
    },
    [user, refreshPages, t],
  );

  const deletePage = useCallback(
    async (id: string) => {
      if (!user) {
        return;
      }
      const wasOnDeletedPage = pathname.endsWith(`/notebook/${id}`);
      const result = await deleteNotebook(id);
      if (result.isErr()) {
        handleApiError({ err: result.error, t });
        return;
      }
      await refreshPages();
      if (wasOnDeletedPage) {
        router.push("/notebook");
      }
    },
    [user, refreshPages, router, pathname, t],
  );

  const downloadBackup = useCallback(async () => {
    if (!user) {
      return;
    }
    const result = await getMyNotebooks();
    if (result.isErr()) {
      handleApiError({ err: result.error, t });
      return;
    }
    const pages = result.data;
    const json = JSON.stringify(pages, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `rust-notebook-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [user, t]);

  const uploadBackup = useCallback(
    async (file: File) => {
      if (!user) {
        return;
      }
      return new Promise<void>((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async (e) => {
          const content = e.target?.result as string;
          if (!content) return;

          const success = await restoreFullBackup(content);
          if (success) {
            await refreshPages();
            alert("Backup restaurado com sucesso!");
            router.push("/docs");
            resolve();
          } else {
            alert("Erro ao ler o arquivo de backup.");
            reject();
          }
        };

        reader.readAsText(file);
      });
    },
    [user, refreshPages, router],
  );

  return (
    <NotebookManagerContext.Provider
      value={{
        pages,
        createPage,
        renamePage,
        updateVisibility,
        deletePage,
        refreshPages,
        uploadBackup,
        downloadBackup,
        clone,
      }}
    >
      {children}
    </NotebookManagerContext.Provider>
  );
}

export const useNotebookManager = () => {
  const context = useContext(NotebookManagerContext);
  if (!context)
    throw new Error("useNotebookManager must be used within Provider");
  return context;
};

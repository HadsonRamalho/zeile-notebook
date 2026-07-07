"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { handleApiError } from "@/lib/api/handle-api-error";
import { getCurrentNotebook } from "@/lib/api/notebook-service";
import { useNotebookManager } from "./notebook-manager";

interface NotebookTitleProps {
  pageId: string;
}

export function NotebookTitle({ pageId }: NotebookTitleProps) {
  const t = useTranslations("api_errors");
  const { renamePage } = useNotebookManager();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [originalTitle, setOriginalTitle] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    const loadNotebook = async () => {
      try {
        const notebook = await getCurrentNotebook(pageId);
        setOriginalTitle(notebook.title);
        setTitle(notebook.title);
      } catch (err) {
        handleApiError({ err, t });
        setTitle("...");
      }
    };
    if (!originalTitle) {
      loadNotebook();
    }
  }, []);

  useEffect(() => {
    const handleUpdate = async (e: any) => {
      if (e.detail.id === pageId) {
        setTitle(e.detail.title);
      }
    };

    window.addEventListener("notebook-title-updated", handleUpdate);
    return () =>
      window.removeEventListener("notebook-title-updated", handleUpdate);
  }, [pageId]);

  const handleBlur = async () => {
    setIsEditing(false);

    const currentTitle = title?.trim() || "";
    const original = originalTitle?.trim() || "";

    if (!currentTitle || currentTitle === original) {
      setTitle(original);
      return;
    }

    await renamePage(pageId, currentTitle);
  };

  if (isEditing) {
    return (
      <input
        className="text-3xl font-bold bg-transparent border-b-2 border-emerald-500 outline-none w-full"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={handleBlur}
      />
    );
  }

  return (
    <h1
      className="text-3xl font-bold cursor-text hover:bg-accent rounded px-1 transition-colors"
      onClick={() => {
        setIsEditing(true);
      }}
    >
      {title || "..."}
    </h1>
  );
}

"use client";

import { useTranslations } from "next-intl";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { handleApiError } from "@/lib/api/handle-api-error";
import { getCurrentNotebookWithBlocks } from "@/lib/api/notebook-service";
import type { Notebook } from "@/lib/types";
import { useNotebookManager } from "./notebook-manager";

interface NotebookContextType {
  triggerSave: () => void;
  saveSignal: number;
  isSaving: boolean;
  setIsSaving: (v: boolean) => void;
  hasSaved: boolean;
  setHasSaved: (v: boolean) => void;
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  triggerAddBlock: () => void;
  addBlockSignal: number;
  notebook: Notebook | null;
  setNotebook: (n: Notebook) => void;
  liveNotebook: Notebook | null;
  setLiveNotebook: (n: Notebook | null) => void;
  isPublic: boolean;
  handleToggleVisibility: (v: boolean) => void;
  setIsCloning: (c: boolean) => void;
  isCloning: boolean;
  triggerClone: () => Promise<void>;
}

const NotebookContext = createContext<NotebookContextType | undefined>(
  undefined,
);

export function NotebookProvider({
  children,
  pageId,
}: {
  children: ReactNode;
  pageId: string | null;
}) {
  const t = useTranslations("api_errors");
  const [saveSignal, setSaveSignal] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [addBlockSignal, setAddBlockSignal] = useState(0);
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [liveNotebook, setLiveNotebook] = useState<Notebook | null>(null);
  const [isPublic, setVisibility] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const { clone, updateVisibility } = useNotebookManager();

  const triggerSave = () => setSaveSignal((prev) => prev + 1);
  const triggerAddBlock = () => setAddBlockSignal((prev) => prev + 1);

  const triggerClone = async () => {
    if (!notebook?.id && !pageId) {
      return;
    }
    try {
      setIsCloning(true);
      const id = notebook?.id ?? pageId;
      if (id) {
        await clone(id);
      }
    } catch (err) {
      handleApiError({ err, t });
    } finally {
      setIsCloning(false);
    }
  };

  const handleToggleVisibility = async (newVisibility: boolean) => {
    setVisibility(newVisibility);

    if (pageId) {
      await updateVisibility(pageId, newVisibility);
    }
  };

  useEffect(() => {
    if (pageId) {
      getCurrentNotebookWithBlocks(pageId).then((data) => {
        if (data) {
          // biome-ignore lint/suspicious/noExplicitAny: <necessário para compatibilidade de tipos legados>
          setVisibility((data as any).isPublic ?? (data as any).is_public);
          setNotebook(data);
        }
      });
    }
  }, [pageId]);

  return (
    <NotebookContext.Provider
      value={{
        handleToggleVisibility,
        isPublic,
        triggerSave,
        saveSignal,
        isSaving,
        setIsSaving,
        triggerClone,
        notebook,
        setNotebook,
        liveNotebook,
        setLiveNotebook,
        isDragging,
        setIsDragging,
        hasSaved,
        setHasSaved,
        triggerAddBlock,
        addBlockSignal,
        setIsCloning,
        isCloning,
      }}
    >
      {children}
    </NotebookContext.Provider>
  );
}

export function useNotebook() {
  const context = useContext(NotebookContext);
  if (!context) {
    throw new Error("useNotebook deve ser usado dentro de um NotebookProvider");
  }
  return context;
}

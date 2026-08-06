"use client";

import type { Notebook, NotebookMeta } from "@/types/notebook-types";

const INDEX_KEY = "my-notebook-pages";
const NOTEBOOK_PREFIX = "rust-notebook-";

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function getAllNotebooks(): Promise<NotebookMeta[]> {
  await delay(50);
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(INDEX_KEY);
  return data ? JSON.parse(data) : [];
}

export async function getNotebook(id: string): Promise<Notebook | null> {
  await delay(100);
  if (typeof window === "undefined") return null;

  const data = localStorage.getItem(`${NOTEBOOK_PREFIX}${id}`);
  if (!data) return null;

  try {
    const parsed = JSON.parse(data);

    return {
      ...parsed,
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
    };
  } catch (error) {
    console.error("Erro ao ler notebook:", error);
    return null;
  }
}

export async function deleteNotebook(id: string): Promise<void> {
  localStorage.removeItem(`${NOTEBOOK_PREFIX}${id}`);
  const index = await getAllNotebooks();
  const newIndex = index.filter((n) => n.id !== id);
  localStorage.setItem(INDEX_KEY, JSON.stringify(newIndex));
}

interface FullBackup {
  version: number;
  index: NotebookMeta[];
  notebooks: Record<string, Notebook>;
}

export async function createFullBackup(): Promise<string> {
  const index = await getAllNotebooks();
  const notebooks: Record<string, Notebook> = {};

  for (const meta of index) {
    const content = await getNotebook(meta.id);
    if (content) {
      notebooks[meta.id] = content;
    }
  }

  const backup: FullBackup = {
    version: 1,
    index,
    notebooks,
  };

  return JSON.stringify(backup, null, 2);
}

export async function restoreFullBackup(jsonString: string): Promise<boolean> {
  try {
    const backup: FullBackup = JSON.parse(jsonString);

    if (!backup.index || !backup.notebooks) {
      throw new Error("Invalid backup format");
    }

    for (const [id, notebook] of Object.entries(backup.notebooks)) {
      localStorage.setItem(`${NOTEBOOK_PREFIX}${id}`, JSON.stringify(notebook));
    }

    const storedIndex = localStorage.getItem(INDEX_KEY);
    const currentIndex = storedIndex ? JSON.parse(storedIndex) : [];

    let newIndex: unknown;

    if (Array.isArray(currentIndex) && Array.isArray(backup.index)) {
      const indexMap = new Map();

      currentIndex.forEach((item: NotebookMeta | string) => {
        const key = typeof item === "string" ? item : item.id;
        indexMap.set(key, item);
      });

      backup.index.forEach((item: NotebookMeta | string) => {
        const key = typeof item === "string" ? item : item.id;
        indexMap.set(key, item);
      });

      newIndex = Array.from(indexMap.values());
    } else if (
      typeof currentIndex === "object" &&
      typeof backup.index === "object"
    ) {
      newIndex = { ...currentIndex, ...backup.index };
    } else {
      newIndex = backup.index;
    }

    localStorage.setItem(INDEX_KEY, JSON.stringify(newIndex));

    return true;
  } catch (e) {
    console.error("Erro ao restaurar backup:", e);
    return false;
  }
}

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type React from "react";
import { createContext, useCallback, useContext, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { handleApiError } from "@/lib/api/handle-api-error";
import {
  deleteNotebook,
  updateNotebookTitle,
  updateNotebookVisibility,
} from "@/lib/api/notebook-service";
import { createTeamPage, fetchTeamPages } from "@/lib/api/teams-service";
import type { NotebookMeta } from "@/types/notebook-types";

interface TeamNotebookManagerType {
  teamPages: Record<string, NotebookMeta[]>;

  refreshTeamPages: (teamId: string) => Promise<void>;
  createTeamPage: (teamId: string) => Promise<void>;
  deleteTeamPage: (teamId: string, pageId: string) => Promise<void>;
  renameTeamPage: (
    teamId: string,
    pageId: string,
    newTitle: string,
  ) => Promise<void>;
  updateTeamPageVisibility: (
    teamId: string,
    pageId: string,
    visible: boolean,
  ) => Promise<void>;
}

const TeamNotebookManagerContext = createContext<
  TeamNotebookManagerType | undefined
>(undefined);

export function TeamNotebookManagerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations("api_errors");
  const d = useTranslations("notebook_defaults");
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [teamPages, setTeamPages] = useState<Record<string, NotebookMeta[]>>(
    {},
  );

  const refreshTeamPages = useCallback(
    async (teamId: string) => {
      if (!user) return;
      const result = await fetchTeamPages(teamId);
      if (result.isErr()) {
        console.error(`Error fetching pages for team ${teamId}:`, result.error);
        return;
      }
      setTeamPages((prev) => ({
        ...prev,
        [teamId]: result.data,
      }));
    },
    [user],
  );

  const createPageForTeam = useCallback(
    async (teamId: string) => {
      if (!user) return;

      const result = await createTeamPage(teamId, d("title"));
      if (result.isErr()) {
        handleApiError({ err: result.error, t });
        return;
      }
      await refreshTeamPages(teamId);
      router.push(`/notebook/${result.data}`);
    },
    [user, refreshTeamPages, router, t, d],
  );

  const renameTeamPage = useCallback(
    async (teamId: string, pageId: string, newTitle: string) => {
      if (!user || !newTitle.trim()) return;

      const result = await updateNotebookTitle(pageId, newTitle);
      if (result.isErr()) {
        handleApiError({ err: result.error, t });
        return;
      }
      window.dispatchEvent(
        new CustomEvent("notebook-title-updated", {
          detail: { id: pageId, title: newTitle },
        }),
      );
      await refreshTeamPages(teamId);
    },
    [user, refreshTeamPages, t],
  );

  const updateTeamPageVisibility = useCallback(
    async (teamId: string, pageId: string, isVisible: boolean) => {
      if (!user) return;

      const result = await updateNotebookVisibility(pageId, isVisible);
      if (result.isErr()) {
        handleApiError({ err: result.error, t });
        return;
      }
      await refreshTeamPages(teamId);
    },
    [user, refreshTeamPages, t],
  );

  const deletePageForTeam = useCallback(
    async (teamId: string, pageId: string) => {
      if (!user) return;

      const wasOnDeletedPage = pathname.endsWith(`/notebook/${pageId}`);
      const result = await deleteNotebook(pageId);
      if (result.isErr()) {
        handleApiError({ err: result.error, t });
        return;
      }
      await refreshTeamPages(teamId);
      if (wasOnDeletedPage) {
        router.push("/notebook");
      }
    },
    [user, refreshTeamPages, router, pathname, t],
  );

  return (
    <TeamNotebookManagerContext.Provider
      value={{
        teamPages,
        refreshTeamPages,
        createTeamPage: createPageForTeam,
        renameTeamPage,
        updateTeamPageVisibility,
        deleteTeamPage: deletePageForTeam,
      }}
    >
      {children}
    </TeamNotebookManagerContext.Provider>
  );
}

export const useTeamNotebookManager = () => {
  const context = useContext(TeamNotebookManagerContext);
  if (!context)
    throw new Error("useTeamNotebookManager must be used within Provider");
  return context;
};

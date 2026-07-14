"use client";

import { createContext, type ReactNode, useContext } from "react";
import { type CommentsController, useComments } from "@/hooks/use-comments";

type CommentsContextValue = CommentsController & {
  canComment: boolean;
  currentUserId?: string;
};

const CommentsContext = createContext<CommentsContextValue | null>(null);

export function CommentsProvider({
  notebookId,
  token,
  canComment,
  currentUserId,
  children,
}: {
  notebookId: string;
  token: string;
  canComment: boolean;
  currentUserId?: string;
  children: ReactNode;
}) {
  const controller = useComments(notebookId, token);
  return (
    <CommentsContext.Provider
      value={{ ...controller, canComment, currentUserId }}
    >
      {children}
    </CommentsContext.Provider>
  );
}

export function useCommentsContext(): CommentsContextValue | null {
  return useContext(CommentsContext);
}

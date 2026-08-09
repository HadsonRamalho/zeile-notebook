"use client";

import { catchErrorSync } from "@catcherjs/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { subscribeNotebookSocket } from "@/features/notebook/lib/notebook-socket";
import type { WsServerMessage } from "@/lib/api/generated/ws-message";
import {
  createCommentThread,
  deleteComment,
  listComments,
  replyToThread,
  updateThreadStatus,
} from "@/lib/api/comments-service";
import type { CommentThread, CommentThreadStatus } from "@/types/comment-types";

export function useComments(notebookId: string, token: string) {
  const [threads, setThreads] = useState<CommentThread[]>([]);

  const refresh = useCallback(() => {
    listComments(notebookId).then((result) => {
      if (result.isOk()) setThreads(result.data ?? []);
    });
  }, [notebookId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const handle = subscribeNotebookSocket(notebookId, token, {
      onText: (raw) => {
        const result = catchErrorSync(
          () => JSON.parse(raw) as WsServerMessage,
        );
        if (result.isOk() && result.data.type === "comment_event") refresh();
      },
    });
    return () => handle.unsubscribe();
  }, [notebookId, token, refresh]);

  const threadsByBlock = useMemo(() => {
    const map = new Map<string, CommentThread[]>();
    for (const thread of threads) {
      const list = map.get(thread.blockId) ?? [];
      list.push(thread);
      map.set(thread.blockId, list);
    }
    return map;
  }, [threads]);

  const createThread = useCallback(
    async (blockId: string, body: string) => {
      await createCommentThread(notebookId, { blockId, body });
      refresh();
    },
    [notebookId, refresh],
  );

  const reply = useCallback(
    async (threadId: string, body: string) => {
      await replyToThread(notebookId, threadId, body);
      refresh();
    },
    [notebookId, refresh],
  );

  const setStatus = useCallback(
    async (threadId: string, status: CommentThreadStatus) => {
      await updateThreadStatus(notebookId, threadId, status);
      refresh();
    },
    [notebookId, refresh],
  );

  const remove = useCallback(
    async (commentId: string) => {
      await deleteComment(notebookId, commentId);
      refresh();
    },
    [notebookId, refresh],
  );

  return {
    threads,
    threadsByBlock,
    createThread,
    reply,
    setStatus,
    remove,
    refresh,
  };
}

export type CommentsController = ReturnType<typeof useComments>;

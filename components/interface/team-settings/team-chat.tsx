"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChatConversation,
  type ConversationMessage,
} from "@/components/notebook/chat/chat-conversation";
import { useAuth } from "@/context/auth-context";
import {
  type ChatMessageDTO,
  deleteTeamMessage,
  editTeamMessage,
  fetchTeamMessages,
  fetchTeamMessageVersions,
  sendTeamMessage,
} from "@/lib/api/chat-service";

const POLL_INTERVAL_MS = 8000;

function toConversation(dto: ChatMessageDTO): ConversationMessage {
  return {
    id: dto.id,
    userId: dto.userId,
    name: dto.authorName,
    text: dto.content,
    createdAt: dto.createdAt,
    isEdited: dto.isEdited,
    deletedAt: dto.deletedAt,
    parentId: dto.parentId,
    quotedMessageId: dto.quotedMessageId,
  };
}

function upsert(list: ChatMessageDTO[], msg: ChatMessageDTO): ChatMessageDTO[] {
  const index = list.findIndex((m) => m.id === msg.id);
  if (index === -1) return [...list, msg];
  const next = [...list];
  next[index] = msg;
  return next;
}

export function TeamChat({ teamId }: { teamId: string }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchTeamMessages(teamId)
        .then((data) => {
          if (!cancelled && Array.isArray(data)) setMessages(data);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [teamId]);

  const conversation = useMemo(() => messages.map(toConversation), [messages]);

  const apply = (dto: ChatMessageDTO | undefined) => {
    if (dto) setMessages((prev) => upsert(prev, dto));
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <ChatConversation
        variant="card"
        messages={conversation}
        currentUserId={user?.id ?? null}
        canSend
        onSend={(text, opts) =>
          void sendTeamMessage(teamId, {
            content: text,
            parentId: opts?.parentId ?? null,
            quotedMessageId: opts?.quotedMessageId ?? null,
          })
            .then(apply)
            .catch(() => {})
        }
        onEdit={(id, text) =>
          void editTeamMessage(teamId, id, text)
            .then(apply)
            .catch(() => {})
        }
        onDelete={(id) =>
          void deleteTeamMessage(teamId, id)
            .then(apply)
            .catch(() => {})
        }
        loadVersions={(id) => fetchTeamMessageVersions(teamId, id)}
        emptyHint="Converse com o time — as mensagens ficam salvas."
      />
    </div>
  );
}

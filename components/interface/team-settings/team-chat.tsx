"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChatConversation,
  type ChatPermissions,
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
import {
  getPermissionCatalog,
  getTeamCapabilities,
} from "@/lib/api/permissions-service";
import { buildImpliedIndex, can as evalCan } from "@/lib/permissions/engine";
import type {
  CapabilitySnapshot,
  PermissionCatalog,
} from "@/lib/types/permission-types";

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
  const [caps, setCaps] = useState<CapabilitySnapshot | null>(null);
  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    getTeamCapabilities(teamId)
      .then((c) => {
        if (!cancelled) setCaps(c);
      })
      .catch(() => {});
    getPermissionCatalog()
      .then((c) => {
        if (!cancelled) setCatalog(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const { canSend, perms } = useMemo(() => {
    if (!caps || !catalog) {
      const none: ChatPermissions = {
        reply: false,
        quote: false,
        edit: false,
        delete: false,
        deleteAny: false,
      };
      return { canSend: false, perms: none };
    }
    const implied = buildImpliedIndex(catalog);
    const target = { notebookId: teamId };
    const check = (key: string) => evalCan(caps, implied, key, target);
    return {
      canSend: check("chat.messages.send"),
      perms: {
        reply: check("chat.messages.reply"),
        quote: check("chat.messages.quote"),
        edit: check("chat.messages.edit"),
        delete: check("chat.messages.delete"),
        deleteAny: check("chat.messages.delete_any"),
      } satisfies ChatPermissions,
    };
  }, [caps, catalog, teamId]);

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
        canSend={canSend}
        perms={perms}
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

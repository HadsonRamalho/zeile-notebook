"use client";

import { Loader2, Pencil, Play, Puzzle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DifficultyBadge } from "@/components/challenges/difficulty-badge";
import { Button } from "@/components/ui/button";
import { getProfile } from "@/lib/api/auth-service";
import { createChallenge, getChallengeById } from "@/lib/api/challenge-service";
import { cn } from "@/lib/utils";
import type { Block, BlockMetadata } from "@/types/block-types";
import type { ChallengeDetail } from "@/types/challenge-types";
import type { User } from "@/types/user-types";
import { ChallengeConfig } from "./challenge-config";
import { ChallengeSolve } from "./challenge-solve";

const DEFAULT_STATEMENT =
  "# Novo desafio\n\nDescreva o problema, o formato de entrada e o de saída.";

function readChallengeId(block: Block): string | undefined {
  const meta = block.metadata;
  if (meta && meta.type === "challenge") return meta.props.challengeId;
  return undefined;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {children}
    </div>
  );
}

export function ChallengeBlock({
  block,
  notebookId,
  canWrite,
  updateBlock,
  updateBlockMetadata,
}: {
  block: Block;
  notebookId?: string | undefined;
  canWrite: boolean;
  updateBlock: (id: string, content: string) => void;
  updateBlockMetadata: (id: string, metadata: BlockMetadata) => void;
}) {
  const t = useTranslations("challenges");
  const challengeId = readChallengeId(block);

  const persistCode = useCallback(
    (content: string) => updateBlock(block.id, content),
    [updateBlock, block.id],
  );

  const [detail, setDetail] = useState<ChallengeDetail | null | "error">(null);
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<"solve" | "config">("solve");
  const creatingRef = useRef(false);

  useEffect(() => {
    getProfile().then((result) => setUser(result.isOk() ? result.data : null));
  }, []);

  useEffect(() => {
    if (challengeId || !canWrite || !notebookId || creatingRef.current) return;
    creatingRef.current = true;
    const slug = `challenge-${block.id.slice(0, 8)}-${Date.now().toString(36)}`;
    createChallenge({
      notebookId,
      blockId: block.id,
      slug,
      title: "Novo desafio",
      statementMd: DEFAULT_STATEMENT,
      languages: ["rust"],
      judgeMode: "io",
    }).then((result) => {
      if (result.isErr()) {
        creatingRef.current = false;
        toast.error(t("authoring.error_generic"));
        return;
      }
      updateBlockMetadata(block.id, {
        type: "challenge",
        props: { challengeId: result.data.id },
      });
      setMode("config");
    });
  }, [challengeId, canWrite, notebookId, block.id, updateBlockMetadata, t]);

  useEffect(() => {
    if (!challengeId) return;
    let active = true;
    getChallengeById(challengeId).then((result) => {
      if (!active) return;
      setDetail(result.isOk() ? result.data : "error");
    });
    return () => {
      active = false;
    };
  }, [challengeId]);

  if (!challengeId) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
          <Puzzle className="size-8 text-muted-foreground opacity-60" />
          {canWrite ? (
            <>
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("authoring.creating")}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("not_found_title")}
            </p>
          )}
        </div>
      </Shell>
    );
  }

  if (detail === null) {
    return (
      <Shell>
        <div className="space-y-3 p-4">
          <div className="h-5 w-1/2 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
        </div>
      </Shell>
    );
  }

  if (detail === "error") {
    return (
      <Shell>
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          {t("not_found_description")}
        </div>
      </Shell>
    );
  }

  const challenge = detail.challenge;

  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Puzzle className="size-4 shrink-0 text-primary" />
          <span className="truncate font-semibold">{challenge.title}</span>
          <DifficultyBadge difficulty={challenge.difficulty} />
        </div>
        {canWrite && (
          <div className="flex items-center gap-1 rounded-full border border-border p-0.5">
            <Button
              variant={mode === "solve" ? "secondary" : "ghost"}
              size="xs"
              onClick={() => setMode("solve")}
            >
              <Play />
              {t("submit")}
            </Button>
            <Button
              variant={mode === "config" ? "secondary" : "ghost"}
              size="xs"
              onClick={() => setMode("config")}
            >
              <Pencil />
              {t("authoring.step_details")}
            </Button>
          </div>
        )}
      </div>

      <div className={cn("p-4")}>
        {mode === "config" && canWrite ? (
          <ChallengeConfig
            challenge={challenge}
            onUpdated={(c) => setDetail({ ...detail, challenge: c })}
          />
        ) : (
          <ChallengeSolve
            detail={detail}
            currentUserId={user?.id}
            canReview={canWrite}
            initialContent={block.content}
            onPersist={canWrite ? persistCode : undefined}
          />
        )}
      </div>
    </Shell>
  );
}

"use client";

import { Eye, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Collaborator } from "@/hooks/use-presence";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

interface FollowBarProps {
  collaborators: Collaborator[];
  followingId: string | null;
  onFollow: (id: string) => void;
  onStop: () => void;
}

export function FollowBar({
  collaborators,
  followingId,
  onFollow,
  onStop,
}: FollowBarProps) {
  const t = useTranslations("presence");

  if (collaborators.length === 0) return null;

  const followed = collaborators.find((c) => c.id === followingId);

  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-card/85 px-2 py-1.5 shadow-lg backdrop-blur-md">
      {followed ? (
        <>
          <span className="flex items-center gap-1.5 pl-1 text-xs text-foreground">
            <Eye className="size-3.5 text-primary" />
            {t("following", { name: followed.name })}
          </span>
          <button
            type="button"
            onClick={onStop}
            aria-label={t("stop_following")}
            title={t("stop_following")}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </>
      ) : (
        <>
          <span className="pl-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {t("follow")}
          </span>
          <div className="flex items-center -space-x-2">
            {collaborators.slice(0, 5).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onFollow(c.id)}
                title={t("follow_name", { name: c.name })}
                className={cn(
                  "rounded-full ring-2 ring-card transition-transform hover:z-10 hover:scale-110",
                )}
              >
                <Avatar size="sm" className="size-6">
                  {c.avatar ? (
                    <AvatarImage src={c.avatar} alt={c.name} />
                  ) : null}
                  <AvatarFallback
                    style={{ backgroundColor: c.color }}
                    className="text-[9px] font-medium text-white"
                  >
                    {initials(c.name)}
                  </AvatarFallback>
                </Avatar>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

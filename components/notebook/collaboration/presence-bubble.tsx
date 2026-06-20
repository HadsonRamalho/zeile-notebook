"use client";

import { Users } from "lucide-react";
import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Collaborator } from "@/hooks/use-presence";
import type { User } from "@/lib/types/user-types";

interface PresenceBubbleProps {
  socketUserId: string | null;
  collaborators: Collaborator[];
  currentUser: User | null;
}

const stringToColor = (str: string) => {
  if (str.includes("Hadson")) {
    return "hsl(157, 76%, 35%)";
  }
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${hash % 360}, 60%, 40%)`;
};

function getInitials(name: string) {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) {
    const first = parts[0]?.[0] || "";
    const last = parts[parts.length - 1]?.[0] || "";
    return `${first}${last}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function PresenceBubble({
  socketUserId,
  collaborators,
  currentUser,
}: PresenceBubbleProps) {
  // Combine current user (ourselves) and other active collaborators
  const allUsers = React.useMemo(() => {
    const list = [];

    // Add current user
    list.push({
      id: socketUserId || "me",
      name: currentUser?.name || "Visitante",
      avatar: currentUser?.avatar_url || null,
      isGuest: !currentUser,
      isMe: true,
      color: currentUser?.name
        ? stringToColor(currentUser.name)
        : "hsl(215, 60%, 40%)",
    });

    // Add collaborators
    for (const c of collaborators) {
      list.push({
        id: c.id,
        name: c.name,
        avatar: c.avatar,
        isGuest: c.isGuest,
        isMe: false,
        color: c.color,
      });
    }

    return list;
  }, [socketUserId, collaborators, currentUser]);

  const totalCount = allUsers.length;
  const mainUser = allUsers[0]; // Show the current user's avatar as the main one

  return (
    <div className="fixed bottom-20 right-6 z-200 pointer-events-auto print:hidden">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="relative flex items-center justify-center p-0.5 rounded-full border border-border bg-card/80 backdrop-blur-md shadow-md transition-all hover:scale-105 hover:bg-card/90 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
          >
            <div className="relative">
              <Avatar size="default" className="border border-border/50">
                {mainUser?.avatar ? (
                  <AvatarImage src={mainUser.avatar} alt={mainUser.name} />
                ) : null}
                <AvatarFallback
                  style={{ backgroundColor: mainUser?.color }}
                  className="text-white font-semibold text-xs animate-fade-in"
                >
                  {getInitials(mainUser?.name || "V")}
                </AvatarFallback>
              </Avatar>

              {/* Badge showing the count */}
              <span className="absolute -top-1 -right-1.5 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-fd-primary text-[8px] font-bold text-fd-primary-foreground ring-1 ring-background animate-in zoom-in duration-200">
                {totalCount}
              </span>
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="top"
          sideOffset={8}
          className="w-72 p-3 bg-card/95 border border-border backdrop-blur-md shadow-xl rounded-xl"
        >
          <div className="flex items-center gap-2 pb-2 mb-2 border-b border-border">
            <Users size={16} className="text-muted-foreground" />
            <h4 className="font-semibold text-sm text-foreground">
              Quem está na página ({totalCount})
            </h4>
          </div>

          <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
            {allUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between gap-3 p-1.5 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Avatar size="sm">
                    {user.avatar ? (
                      <AvatarImage src={user.avatar} alt={user.name} />
                    ) : null}
                    <AvatarFallback
                      style={{ backgroundColor: user.color }}
                      className="text-white text-[10px] font-medium"
                    >
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-foreground truncate max-w-[120px]">
                      {user.name}{" "}
                      {user.isMe && (
                        <span className="text-muted-foreground font-normal text-[10px]">
                          (Você)
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      {user.isGuest ? "Visitante" : "Membro"}
                    </span>
                  </div>
                </div>

                <Badge
                  variant={user.isGuest ? "outline" : "secondary"}
                  className="text-[9px] px-1.5 py-0"
                >
                  {user.isGuest ? "Convidado" : "Autenticado"}
                </Badge>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

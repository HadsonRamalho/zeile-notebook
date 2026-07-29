"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NotebookManagerProvider } from "@/components/notebook/notebook-manager";
import { NotebookRail } from "@/components/notebook/sidebar/notebook-rail";
import { TeamNotebookManagerProvider } from "@/components/notebook/team/team-notebook-manager";
import { cn } from "@/lib/utils";

const BARE_PREFIXES = [
  "/docs",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth-callback",
  "/invite",
];

function isBareRoute(pathname: string) {
  const withoutLocale = pathname.replace(/^\/(pt-br|en)(?=\/|$)/, "") || "/";
  if (withoutLocale === "/") return true;
  return BARE_PREFIXES.some((prefix) => withoutLocale.startsWith(prefix));
}

function isNotebookRoute(pathname: string) {
  const withoutLocale = pathname.replace(/^\/(pt-br|en)(?=\/|$)/, "") || "/";
  return withoutLocale.startsWith("/notebook");
}

export function AppRailShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isBareRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <TeamNotebookManagerProvider>
      <NotebookManagerProvider>
        <div className="flex min-h-screen">
          <NotebookRail />
          <div
            className={cn(
              "min-w-0 flex-1",
              isNotebookRoute(pathname) &&
                "px-6 pb-6 pt-20 md:px-8 md:pb-8 md:pt-8",
            )}
          >
            {children}
          </div>
        </div>
      </NotebookManagerProvider>
    </TeamNotebookManagerProvider>
  );
}

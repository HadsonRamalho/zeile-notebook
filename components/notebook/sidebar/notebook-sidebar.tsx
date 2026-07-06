"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { TeamsSidebar } from "../teams-sidebar";
import { UserSidebar } from "../user-sidebar";

export function NotebookSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label="Toggle sidebar"
        className="md:hidden fixed left-3 top-[4.25rem] z-40 p-2 rounded-md bg-fd-card border text-fd-muted-foreground hover:bg-fd-accent/50 hover:text-fd-accent-foreground/80 transition-colors"
      >
        {mobileOpen ? (
          <PanelLeftClose size={18} />
        ) : (
          <PanelLeftOpen size={18} />
        )}
      </button>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 top-14 z-20 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed md:sticky top-14 left-0 z-30 h-[calc(100vh-3.5rem)] w-72 shrink-0 border-e bg-fd-card text-sm transition-transform md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex flex-col gap-4 overflow-y-auto h-full p-3">
          <UserSidebar />
          <TeamsSidebar />
        </div>
      </aside>
    </>
  );
}

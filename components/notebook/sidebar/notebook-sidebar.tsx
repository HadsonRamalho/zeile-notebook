"use client";

import { FileText, PanelLeftClose, PanelLeftOpen, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useNotebookManager } from "../notebook-manager";
import { TeamsSidebar } from "../teams-sidebar";
import { useTeamNotebookManager } from "../team/team-notebook-manager";
import { UserSidebar } from "../user-sidebar";

const MIN_WIDTH = 240;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 288;
const RAIL_WIDTH = 56;
const STORAGE_KEY = "notebook-sidebar-width";

function CollapsedRail() {
  const { pages } = useNotebookManager();
  const { teamPages } = useTeamNotebookManager();
  const allTeamPages = Object.values(teamPages).flat();

  return (
    <div className="flex flex-1 flex-col items-center gap-1 overflow-y-auto py-2">
      {pages.map((page) => (
        <Link
          key={page.id}
          href={`/notebook/${page.id}`}
          title={page.title || "Sem título"}
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <FileText size={16} />
        </Link>
      ))}
      {allTeamPages.length > 0 && (
        <div className="my-1 h-px w-6 bg-sidebar-border" />
      )}
      {allTeamPages.map((page) => (
        <Link
          key={page.id}
          href={`/notebook/${page.id}`}
          title={page.title || "Sem título"}
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Users size={16} />
        </Link>
      ))}
    </div>
  );
}

export function NotebookSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const resizingRef = useRef(false);

  useEffect(() => {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    if (stored >= MIN_WIDTH && stored <= MAX_WIDTH) setWidth(stored);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!resizingRef.current) return;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      setWidth(next);
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.cursor = "";
      localStorage.setItem(STORAGE_KEY, String(width));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [width]);

  return (
    <>
      {!mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir sidebar"
          className="md:hidden fixed left-3 top-[4.25rem] z-40 p-2 rounded-md bg-sidebar border border-sidebar-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <PanelLeftOpen size={18} />
        </button>
      )}

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 top-14 z-20 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        style={{ width: collapsed ? RAIL_WIDTH : width }}
        className={cn(
          "fixed md:sticky top-14 left-0 z-30 h-[calc(100vh-3.5rem)] md:top-[4.25rem] md:left-3 md:mb-3 md:h-[calc(100vh-5rem)] shrink-0 border border-sidebar-border md:rounded-xl md:shadow-sm bg-sidebar text-sidebar-foreground text-sm transition-[transform,width] md:translate-x-0 overflow-hidden",
          mobileOpen ? "translate-x-0 w-72" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="flex h-full flex-col" style={{ width: collapsed ? RAIL_WIDTH : width }}>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar sidebar"
            className="md:hidden flex items-center justify-end px-3 py-2 text-muted-foreground hover:text-accent-foreground transition-colors"
          >
            <PanelLeftClose size={18} />
          </button>

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
            title={collapsed ? "Expandir sidebar" : "Recolher sidebar"}
            className={cn(
              "hidden md:flex items-center px-3 py-2 text-muted-foreground hover:text-accent-foreground transition-colors",
              collapsed ? "justify-center" : "justify-end gap-2",
            )}
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>

          {collapsed ? (
            <>
              <div className="mx-3 border-t border-sidebar-border" />
              <CollapsedRail />
            </>
          ) : (
            <div className="flex flex-col divide-y divide-sidebar-border overflow-y-auto flex-1 p-3 pt-0">
              <div className="pb-4">
                <UserSidebar />
              </div>
              <div className="pt-4">
                <TeamsSidebar />
              </div>
            </div>
          )}
        </div>

        {!collapsed && (
          <div
            onPointerDown={(e) => {
              e.preventDefault();
              resizingRef.current = true;
              document.body.style.cursor = "col-resize";
            }}
            className="hidden md:block absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50"
          />
        )}
      </aside>
    </>
  );
}

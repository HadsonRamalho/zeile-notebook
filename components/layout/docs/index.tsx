"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import type { PageTree, PageTreeNode } from "@/lib/docs";
import { TreeContextProvider } from "@/lib/tree-context";
import { isActive } from "@/lib/urls";
import { cn } from "@/lib/utils";
import { buttonVariants } from "../../ui/button";
import { AppFooter } from "../app-footer";
import { LargeSearchToggle, SearchToggle } from "../search-toggle";
import type { BaseLayoutProps } from "../shared";

export interface DocsLayoutProps extends BaseLayoutProps {
  tree: PageTree;
  sidebar?: {
    defaultOpenLevel?: number;
    banner?: ReactNode;
  };
}

function SidebarNodeList({
  nodes,
  onNavigate,
}: {
  nodes: PageTreeNode[];
  onNavigate?: (() => void) | undefined;
}) {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-0.5">
      {nodes.map((node) => {
        if (node.type === "page") {
          const active = isActive(node.url, pathname, false);
          return (
            <li key={node.url}>
              <Link
                href={node.url}
                {...(onNavigate ? { onClick: onNavigate } : {})}
                className={cn(
                  "block rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                  active && "bg-accent font-medium text-primary",
                )}
              >
                {node.name}
              </Link>
            </li>
          );
        }

        return (
          <li key={node.name} className="mt-2 first:mt-0">
            {node.index ? (
              <Link
                href={node.index.type === "page" ? node.index.url : "#"}
                {...(onNavigate ? { onClick: onNavigate } : {})}
                className="block px-2 py-1 text-xs font-medium uppercase text-muted-foreground"
              >
                {node.name}
              </Link>
            ) : (
              <p className="px-2 py-1 text-xs font-medium uppercase text-muted-foreground">
                {node.name}
              </p>
            )}
            <SidebarNodeList nodes={node.children} onNavigate={onNavigate} />
          </li>
        );
      })}
    </ul>
  );
}

export function DocsLayout({
  nav = {},
  sidebar = {},
  children,
  tree,
}: DocsLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (
    <div className="flex flex-col gap-3 p-4">
      <LargeSearchToggle hideIfDisabled />
      {sidebar.banner}
      <SidebarNodeList
        nodes={tree.children}
        onNavigate={() => setMobileOpen(false)}
      />
    </div>
  );

  return (
    <TreeContextProvider tree={tree}>
      {nav.component}

      <div className="flex pt-14">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Alternar menu"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "md:hidden fixed left-3 top-[4.25rem] z-40 bg-sidebar border border-sidebar-border",
          )}
        >
          {mobileOpen ? <X /> : <Menu />}
        </button>

        {mobileOpen && (
          <button
            type="button"
            aria-label="Fechar menu"
            className="fixed inset-0 top-14 z-20 bg-black/40 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <aside
          className={cn(
            "fixed md:sticky top-14 left-0 z-30 h-[calc(100vh-3.5rem)] w-72 shrink-0 border-e border-sidebar-border bg-sidebar text-sidebar-foreground text-sm transition-transform md:translate-x-0 overflow-y-auto",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {sidebarContent}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="hidden items-center justify-end gap-2 p-3 md:flex">
            <SearchToggle hideIfDisabled />
          </div>
          {children}
          <AppFooter />
        </div>
      </div>
    </TreeContextProvider>
  );
}

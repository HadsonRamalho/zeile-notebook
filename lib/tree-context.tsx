"use client";

import { usePathname } from "next/navigation";
import { createContext, type ReactNode, use, useMemo } from "react";
import type { PageTree, PageTreeNode } from "./docs";

interface TreeContextValue {
  root: PageTree;
}

const TreeContext = createContext<TreeContextValue | null>(null);

export function TreeContextProvider({
  tree,
  children,
}: {
  tree: PageTree;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ root: tree }), [tree]);
  return <TreeContext value={value}>{children}</TreeContext>;
}

export function useTreeContext() {
  const context = use(TreeContext);
  if (!context) {
    throw new Error(
      "useTreeContext must be used under <TreeContextProvider />",
    );
  }
  return context;
}

function findPath(
  nodes: PageTreeNode[],
  pathname: string,
  trail: PageTreeNode[],
): PageTreeNode[] | null {
  for (const node of nodes) {
    if (node.type === "page" && node.url === pathname) {
      return [...trail, node];
    }
    if (node.type === "folder") {
      if (
        node.index &&
        node.index.type === "page" &&
        node.index.url === pathname
      ) {
        return [...trail, node, node.index];
      }
      const found = findPath(node.children, pathname, [...trail, node]);
      if (found) return found;
    }
  }
  return null;
}

export function useTreePath(): PageTreeNode[] {
  const { root } = useTreeContext();
  const pathname = usePathname();

  return useMemo(
    () => findPath(root.children, pathname, []) ?? [],
    [root, pathname],
  );
}

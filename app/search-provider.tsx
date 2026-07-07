"use client";
import type { ReactNode } from "react";
import SearchDialog from "@/components/search";
import { SearchContextProvider } from "@/lib/search-context";

export function Provider({ children }: { children: ReactNode }) {
  return (
    <SearchContextProvider>
      {children}
      <SearchDialog />
    </SearchContextProvider>
  );
}

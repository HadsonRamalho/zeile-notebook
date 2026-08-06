"use client";
import type { ReactNode } from "react";
import SearchDialog from "@/components/docs/search";
import { SearchContextProvider } from "@/context/search-context";

export function Provider({ children }: { children: ReactNode }) {
  return (
    <SearchContextProvider>
      {children}
      <SearchDialog />
    </SearchContextProvider>
  );
}

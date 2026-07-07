"use client";

import { createContext, type ReactNode, use, useMemo, useState } from "react";

interface SearchContextValue {
  open: boolean;
  setOpenSearch: (open: boolean) => void;
  enabled: boolean;
  hotKey: { key: string; display: string }[];
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchContextProvider({ children }: { children: ReactNode }) {
  const [open, setOpenSearch] = useState(false);

  const value = useMemo(
    () => ({
      open,
      setOpenSearch,
      enabled: true,
      hotKey: [{ key: "k", display: "Ctrl K" }],
    }),
    [open],
  );

  return <SearchContext value={value}>{children}</SearchContext>;
}

export function useSearchContext() {
  const context = use(SearchContext);
  if (!context) {
    throw new Error("useSearchContext must be used under <SearchContextProvider />");
  }
  return context;
}

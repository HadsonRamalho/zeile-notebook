"use client";

import { createContext, useContext } from "react";

export const MermaidEditContext = createContext<boolean>(false);

export function useMermaidCanEdit(): boolean {
  return useContext(MermaidEditContext);
}

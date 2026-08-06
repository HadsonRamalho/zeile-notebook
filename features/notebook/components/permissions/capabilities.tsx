"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { CanFn, CapabilitiesController } from "@/hooks/use-capabilities";
import type { PermissionTarget } from "@/types/permission-types";

const CapabilitiesContext = createContext<CapabilitiesController | null>(null);

export function CapabilitiesProvider({
  value,
  children,
}: {
  value: CapabilitiesController;
  children: ReactNode;
}) {
  return (
    <CapabilitiesContext.Provider value={value}>
      {children}
    </CapabilitiesContext.Provider>
  );
}

export function useCapabilitiesContext(): CapabilitiesController {
  const ctx = useContext(CapabilitiesContext);
  if (!ctx) {
    throw new Error(
      "useCapabilitiesContext must be used within a CapabilitiesProvider",
    );
  }
  return ctx;
}

export function useCan(): CanFn {
  return useCapabilitiesContext().can;
}

export function Can({
  permission,
  target,
  children,
  fallback = null,
}: {
  permission: string;
  target?: Partial<Omit<PermissionTarget, "notebookId">>;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const can = useCan();
  return <>{can(permission, target) ? children : fallback}</>;
}

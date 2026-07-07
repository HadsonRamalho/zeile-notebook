import type { ReactNode } from "react";

export function AppShell({
  nav,
  children,
}: {
  nav?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main id="nd-home-layout" className="flex flex-1 flex-col">
      {nav}
      {children}
    </main>
  );
}

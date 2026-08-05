import { NextIntlClientProvider, useMessages } from "next-intl";
import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { AppRailShell } from "@/components/layout/app-rail-shell";
import { PWARegistration } from "@/components/pwa-registration";
import { AuthProvider } from "@/context/auth-context";
import { Provider } from "../search-provider";

export default function Layout({ children }: { children: ReactNode }) {
  const messages = useMessages();
  return (
    <NextIntlClientProvider messages={messages}>
      <AuthProvider>
        <PWARegistration />
        <Toaster richColors={true} />
        <Provider>
          <AppRailShell>{children}</AppRailShell>
        </Provider>
      </AuthProvider>
    </NextIntlClientProvider>
  );
}

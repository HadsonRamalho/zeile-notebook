import { NextIntlClientProvider, useMessages } from "next-intl";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/auth-context";
import { PWARegistration } from "@/components/pwa-registration";
import { Provider } from "../search-provider";

export default function Layout({ children }: any) {
  const messages = useMessages();
  return (
    <NextIntlClientProvider messages={messages}>
      <AuthProvider>
        <PWARegistration />
        <Toaster richColors={true} />
        <Provider>{children}</Provider>
      </AuthProvider>
    </NextIntlClientProvider>
  );
}

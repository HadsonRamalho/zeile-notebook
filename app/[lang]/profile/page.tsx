import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { NextIntlClientProvider, useMessages } from "next-intl";
import { ProfileForm } from "@/components/profile-form";
import { baseOptions } from "@/lib/layout.shared";

export const metadata: Metadata = {
  title: "Perfil",
  description: "Gerencie as configurações da sua conta.",
};

export default function ProfilePage() {
  const messages = useMessages();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppShell nav={baseOptions({ variant: "global" }).nav?.component}>
        <main className="flex flex-1 flex-col items-center mt-10 p-4">
          <div className="w-full max-w-6xl space-y-6">
            <NextIntlClientProvider messages={messages}>
              <ProfileForm />
            </NextIntlClientProvider>
          </div>
        </main>
      </AppShell>
    </div>
  );
}

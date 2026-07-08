import type { Metadata } from "next";
import { NextIntlClientProvider, useMessages } from "next-intl";
import { ProfileForm } from "@/components/profile-form";

export const metadata: Metadata = {
  title: "Perfil",
  description: "Gerencie as configurações da sua conta.",
};

export default function ProfilePage() {
  const messages = useMessages();
  return (
    <main className="flex flex-1 flex-col items-center p-4 pt-10">
      <div className="w-full max-w-6xl space-y-6">
        <NextIntlClientProvider messages={messages}>
          <ProfileForm />
        </NextIntlClientProvider>
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import { NextIntlClientProvider, useMessages } from "next-intl";
import { ResetPasswordForm } from "@/components/interface/reset-password/reset-password-form";

export const metadata: Metadata = {
  title: "Redefinir Senha",
};

export default function ResetPasswordPage() {
  const messages = useMessages();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 flex-col items-center mt-6 p-4">
        <div className="w-full max-w-6xl space-y-6">
          <NextIntlClientProvider messages={messages}>
            <ResetPasswordForm />
          </NextIntlClientProvider>
        </div>
      </main>
    </div>
  );
}

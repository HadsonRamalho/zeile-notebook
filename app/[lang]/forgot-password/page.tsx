import type { Metadata } from "next";
import { NextIntlClientProvider, useMessages } from "next-intl";
import { ForgotPasswordForm } from "@/components/interface/forgot-password/forgot-password-form";

export const metadata: Metadata = {
  title: "Esqueci a Senha",
};

export default function ForgotPasswordPage() {
  const messages = useMessages();
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="flex flex-1 flex-col items-center mt-6 p-4">
        <div className="w-full max-w-6xl space-y-6">
          <NextIntlClientProvider messages={messages}>
            <ForgotPasswordForm />
          </NextIntlClientProvider>
        </div>
      </main>
    </div>
  );
}

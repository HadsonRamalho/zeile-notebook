import { NextIntlClientProvider, useMessages } from "next-intl";
import { AppShell } from "@/components/layout/app-shell";
import { SettingsForm } from "@/components/interface/settings/settings-form";
import { baseOptions } from "@/lib/layout.shared";

export default function SettingsPage() {
  const messages = useMessages();

  return (
    <AppShell nav={baseOptions({ variant: "global" }).nav?.component}>
      <div className="container mx-auto max-w-6xl px-4 pt-24 pb-10 space-y-8">
        <NextIntlClientProvider messages={messages}>
          <SettingsForm />
        </NextIntlClientProvider>
      </div>
    </AppShell>
  );
}

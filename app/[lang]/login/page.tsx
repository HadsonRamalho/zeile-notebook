import Image from "next/image";
import {
  NextIntlClientProvider,
  useMessages,
  useTranslations,
} from "next-intl";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { HelixPercentLoader } from "@/components/motion/helix-percent-loader";

function LoginContent() {
  const t = useTranslations("docs");
  const messages = useMessages();

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm space-y-6">
        <a href="/" className="flex items-center gap-2 self-center font-medium">
          <div className="flex mx-auto items-center gap-2">
            <Image src="/logo.png" alt="Logo" width={50} height={50} />
            <h1 className="text-xl font-bold"> {t("docs")}</h1>
          </div>
        </a>
        <NextIntlClientProvider messages={messages}>
          <LoginForm />
        </NextIntlClientProvider>
      </div>
    </div>
  );
}

export default function Page() {
  const t = useTranslations("loading");
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center flex-col gap-4">
          <HelixPercentLoader label={t("loading")} />
          <p className="text-muted-foreground animate-pulse">{t("loading")}</p>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

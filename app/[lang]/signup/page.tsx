import Image from "next/image";
import {
  NextIntlClientProvider,
  useMessages,
  useTranslations,
} from "next-intl";
import { SignupForm } from "@/features/auth/components/signup-form";

export default function SignupPage() {
  const t = useTranslations("docs");
  const messages = useMessages();

  return (
    <div className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="/" className="flex items-center gap-2 self-center font-medium">
          <div className="flex mx-auto items-center gap-2">
            <Image src="/logo.png" alt="Logo" width={50} height={50} />
            <h1 className="text-xl font-bold">{t("docs")}</h1>
          </div>
        </a>
        <NextIntlClientProvider messages={messages}>
          <SignupForm />
        </NextIntlClientProvider>
      </div>
    </div>
  );
}

import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Image from "next/image";
import Link from "next/link";
import { NextIntlClientProvider, useLocale, useMessages } from "next-intl";
import { LanguageSelect } from "@/components/interface/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserNav } from "@/components/nav/user-nav";

function IconWithTitle() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
    >
      <Image src="/logo.png" alt="Logo" width={34} height={34} />
      <span className="text-lg font-bold hidden md:block">Zeile</span>
    </Link>
  );
}

interface BaseOptionsProps {
  variant: "default" | "home" | "global";
}

export function baseOptions({
  variant = "default",
}: BaseOptionsProps): BaseLayoutProps {
  const messages = useMessages();
  const locale = useLocale();

  return {
    nav: {
      children:
        variant === "default" ? (
          <NextIntlClientProvider messages={messages}>
            <div className="flex w-full items-center justify-between gap-2 print:hidden">
              <IconWithTitle />

              <UserNav />
            </div>
          </NextIntlClientProvider>
        ) : null,

      component:
        variant !== "default" ? (
          <NextIntlClientProvider locale={locale} messages={messages}>
            <header className="fixed top-0 z-50 w-full border-b border-border/40 bg-fd-background/95 backdrop-blur supports-backdrop-filter:bg-fd-background/60 print:hidden">
              <div className="container mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-6">
                <div className="flex gap-4">
                  <IconWithTitle />
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex justify-end items-end">
                    <LanguageSelect />
                  </div>
                  <UserNav />
                  <ThemeToggle />
                </div>
              </div>
            </header>
          </NextIntlClientProvider>
        ) : null,
      title: null,
    },
    githubUrl: "https://github.com/HadsonRamalho/docs",
    links: [],
  };
}

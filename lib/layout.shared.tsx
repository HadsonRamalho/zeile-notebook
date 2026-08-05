import Image from "next/image";
import Link from "next/link";
import { NextIntlClientProvider, useLocale, useMessages } from "next-intl";
import { LanguageSelect } from "@/components/interface/locale-switcher";
import { PrimaryNav } from "@/components/layout/primary-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserNav } from "@/components/nav/user-nav";
import type { BaseLayoutProps } from "../components/layout/shared";

function IconWithTitle() {
  return (
    <Link
      href="/"
      className="group relative flex items-center gap-2 transition-opacity hover:opacity-90"
    >
      <span
        aria-hidden
        className="animate-ambient-drift absolute -left-3 -top-3 size-14 rounded-full bg-accent-violet/25 blur-xl transition-opacity group-hover:opacity-80"
      />
      <Image
        src="/logo.png"
        alt="Logo"
        width={34}
        height={34}
        className="relative"
      />
      <span className="relative text-lg font-bold hidden md:block">Zeile</span>
    </Link>
  );
}

interface BaseOptionsProps {
  variant: "default" | "home" | "global" | "notebook" | "docs";
}

export function useBaseOptions({
  variant = "default",
}: BaseOptionsProps): BaseLayoutProps {
  const messages = useMessages();
  const locale = useLocale();

  return {
    nav: {
      children:
        variant === "default" ? (
          <NextIntlClientProvider locale={locale} messages={messages}>
            <div className="flex w-full items-center justify-between gap-2 print:hidden">
              <IconWithTitle />

              <div className="flex items-center gap-1.5">
                <LanguageSelect />
                <ThemeToggle />
                <UserNav />
              </div>
            </div>
          </NextIntlClientProvider>
        ) : null,

      component:
        variant !== "default" ? (
          <NextIntlClientProvider locale={locale} messages={messages}>
            <header className="fixed top-0 z-50 w-full overflow-hidden border-b border-border/70 bg-sidebar/90 backdrop-blur-lg supports-backdrop-filter:bg-sidebar/70 print:hidden">
              <div className="flex h-14 items-center justify-between gap-4 px-4 md:px-6">
                <div className="flex items-center gap-6">
                  <IconWithTitle />
                  <PrimaryNav />
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <LanguageSelect />
                    <ThemeToggle />
                  </div>
                  <div className="h-5 w-px bg-border" />
                  <UserNav />
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

import { AppShell } from "@/components/layout/app-shell";
import { BookSearch, Code, Lock, Sparkles, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  HomeMarquee,
  LanguageShowcaseGrid,
} from "@/components/interface/home/languages";
import { NotebooksCta } from "@/components/interface/home/notebooks-cta";
import { RetroGrid } from "@/components/ui/retro-grid";
import { baseOptions } from "@/lib/layout.shared";

export default function HomePage() {
  const t = useTranslations("homepage");

  return (
    <AppShell nav={baseOptions({ variant: "home" }).nav?.component}>
      <main className="relative overflow-hidden bg-background">
        <section className="relative flex min-h-[80vh] w-full flex-col items-center justify-center overflow-hidden px-6 py-24 text-center md:py-32">
          <div className="z-10 flex flex-col items-center justify-center gap-6 max-w-4xl">
            <div className="flex flex-row items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-1000">
              <Image
                src="/logo.png"
                alt="Zeile Logo"
                width={80}
                height={80}
                className="drop-shadow-lg"
              />
            </div>

            <h1 className="pointer-events-none z-10 whitespace-pre-wrap bg-linear-to-b from-primary via-primary/70 to-primary bg-clip-text text-center text-5xl font-extrabold leading-none tracking-tighter text-transparent sm:text-7xl lg:text-8xl">
              {t("hero.title")}
            </h1>

            <p className="mt-4 max-w-2xl text-lg text-muted-foreground sm:text-xl md:text-2xl animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-150 fill-mode-both">
              {t("hero.subtitle")}
            </p>

            <div className="mt-8 grid grid-cols-1 md:flex flex-row justify-center gap-4 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300 fill-mode-both">
              <NotebooksCta label={t("nav.my_notebooks")} />

              <Link
                href="/explore"
                className="flex h-14 items-center justify-center rounded-full border bg-background px-8 text-sm font-bold shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground w-full"
              >
                <BookSearch className="mr-2 h-4 w-4" />
                {t("nav.explore")}
              </Link>
            </div>
          </div>

          <RetroGrid className="opacity-40" />
        </section>

        <section className="border-t bg-muted/20 py-24">
          <div className="mx-auto max-w-7xl px-6">
            <div className="mb-16 text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                {t("features.title")}
              </h2>
              <p className="mt-4 text-muted-foreground">
                {t("features.subtitle")}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
              <FeatureCard
                icon={<Code className="h-8 w-8 text-emerald-500" />}
                title={t("features.md_title")}
                desc={t("features.md_desc")}
              />
              <FeatureCard
                icon={<Users className="h-8 w-8 text-blue-500" />}
                title={t("features.team_title")}
                desc={t("features.team_desc")}
              />
              <FeatureCard
                icon={<Lock className="h-8 w-8 text-rose-500" />}
                title={t("features.privacy_title")}
                desc={t("features.privacy_desc")}
              />
              <FeatureCard
                icon={<Sparkles className="h-8 w-8 text-amber-500" />}
                title={t("features.public_title")}
                desc={t("features.public_desc")}
              />
            </div>
          </div>

          <section className="py-10">
            <div className="mx-auto">
              <VideoShowcase />
            </div>
          </section>

          <LanguageShowcaseGrid />
          <HomeMarquee reverse={false} />
          <HomeMarquee reverse={true} />
          <HomeMarquee reverse={false} />
        </section>

        <section className="border-y bg-background">
          <div className="mx-auto max-w-7xl px-6 py-20">
            <div className="flex flex-col md:flex-row items-center justify-between gap-12">
              <div className="max-w-md">
                <h2 className="text-3xl font-bold mb-4 italic">
                  {t("about.shortcuts_title")}
                </h2>
                <p className="text-muted-foreground">
                  {t("about.shortcuts_desc")}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full md:w-auto">
                {shortcuts.map((s) => (
                  <Link
                    key={s.title}
                    href={s.href}
                    className="group flex items-center p-4 bg-muted/30 border rounded-xl hover:border-primary hover:bg-muted/50 transition-all text-sm font-medium"
                  >
                    <span className="text-primary mr-4 text-lg font-mono font-bold bg-primary/10 px-2 py-1 rounded">
                      {s.prefix}
                    </span>
                    {t(s.title)}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-24 text-center">
          <h2 className="text-4xl font-bold mb-6 tracking-tight">
            {t("contribute.title")}
          </h2>
          <p className="text-muted-foreground mb-8 max-w-lg mx-auto text-lg">
            {t("contribute.description")}
          </p>
          <Link
            href="https://github.com/HadsonRamalho/docs"
            className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            {t("contribute.button")}
          </Link>
        </section>
      </main>
    </AppShell>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex flex-col items-start rounded-2xl border bg-background p-6 shadow-sm transition-all hover:shadow-md hover:-translate-y-1">
      <div className="mb-4 rounded-lg bg-muted p-3">{icon}</div>
      <h3 className="mb-2 text-xl font-semibold">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

const shortcuts = [
  { prefix: "01", title: "items.home", href: "/docs" },
  { prefix: "02", title: "nav.explore", href: "/explore" },
];

function VideoShowcase() {
  return (
    <section className="relative z-20 mt-10 w-full px-4 md:mx-auto md:max-w-7xl md:px-6">
      <div className="relative overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-4 py-3">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500/80" />
            <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
            <div className="h-3 w-3 rounded-full bg-green-500/80" />
          </div>
          <div className="mx-auto flex h-6 items-center rounded bg-background px-4 text-xs font-medium text-muted-foreground shadow-sm">
            zeile.app/demo
          </div>
        </div>

        <div className="flex w-full flex-col md:flex-row bg-black">
          <div className="relative w-full md:w-1/2 border-b md:border-b-0 md:border-r border-white/10">
            <div style={{ paddingBottom: "100%", position: "relative" }}>
              <iframe
                src="https://player.vimeo.com/video/1166077256?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=1&loop=1&background=1"
                allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  display: "block",
                }}
                title="Zeile Demo Left"
              />
            </div>
          </div>

          <div className="relative w-full md:w-1/2">
            <div style={{ paddingBottom: "100%", position: "relative" }}>
              <iframe
                src="https://player.vimeo.com/video/1166078982?badge=0&autopause=0&player_id=0&app_id=58479&autoplay=1&muted=1&loop=1&background=1"
                allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  display: "block",
                }}
                title="Zeile Demo Right"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

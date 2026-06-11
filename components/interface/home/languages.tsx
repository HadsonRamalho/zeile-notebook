import { CppIcon } from "@/components/icons/cpp-icon";
import { GoIcon } from "@/components/icons/go-icon";
import { PythonIcon } from "@/components/icons/python-icon";
import { ReactIcon } from "@/components/icons/react-icon";
import { RustIcon } from "@/components/icons/rust-icon";
import { ZigIcon } from "@/components/icons/zig-icon";

const languages = [
  {
    name: "Rust",
    icon: <RustIcon />,
    color:
      "hover:border-orange-500/50 hover:bg-orange-500/10 hover:shadow-orange-500/20",
  },
  {
    name: "React/TypeScript",
    icon: <ReactIcon />,
    color:
      "hover:border-cyan-400/50 hover:bg-cyan-400/10 hover:shadow-cyan-400/20",
  },
  {
    name: "Python",
    icon: <PythonIcon />,
    color:
      "hover:border-indigo-400/50 hover:bg-indigo-400/10 hover:shadow-indigo-400/20",
  },
  {
    name: "Go",
    icon: <GoIcon />,
    color:
      "hover:border-blue-300/50 hover:bg-blue-300/10 hover:shadow-blue-300/20",
  },
  {
    name: "C++",
    icon: <CppIcon />,
    color:
      "hover:border-blue-500/50 hover:bg-blue-500/10 hover:shadow-blue-500/20",
  },
  {
    name: "Zig",
    icon: <ZigIcon />,
    color:
      "hover:border-orange-600/50 hover:bg-orange-600/10 hover:shadow-orange-600/20",
  },
];

export function LanguageShowcaseGrid() {
  const t = useTranslations("homepage");

  return (
    <section className="mx-auto max-w-7xl mt-10 md:mt-4 px-6 py-14 text-center">
      <p className="mb-10 md:mb-0 text-3xl font-bold tracking-tight sm:text-4xl">
        {t("supported_languages")}
      </p>

      <div className="grid grid-cols-2 gap-6 md:hidden">
        {languages.map((lang) => (
          <div
            key={lang.name}
            className={`group flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border bg-background/50 p-8 shadow-sm transition-all duration-300 hover:shadow-xl ${lang.color}`}
          >
            <div className="opacity-70 transition-opacity duration-300 group-hover:opacity-100">
              {lang.icon}
            </div>
            <span className="font-mono font-bold tracking-tight text-muted-foreground group-hover:text-foreground">
              {lang.name}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Marquee } from "@/components/ui/marquee";
import { cn } from "@/lib/utils";

export const LanguageCard = ({
  icon,
  name,
  color,
}: {
  icon: ReactNode;
  name: string;
  color: string;
}) => {
  return (
    <figure
      className={cn(
        "w-64 h-30",
        `group flex cursor-pointer flex-col`,
        `items-center justify-center gap-4 rounded-2xl`,
        ` border bg-background/50 p-8 shadow-sm transition-all duration-300 hover:shadow-xl ${color}`,
      )}
    >
      <div className="flex flex-row items-center gap-2">
        {icon}
        <div className="flex flex-col">
          <figcaption className="text-sm font-medium dark:text-white">
            {name}
          </figcaption>
        </div>
      </div>
    </figure>
  );
};

interface HomeMarqueeProps {
  reverse: boolean;
}

export function HomeMarquee({ reverse }: HomeMarqueeProps) {
  return (
    <div className="hidden md:flex relative w-full flex-col items-center justify-center overflow-hidden">
      <Marquee
        pauseOnHover
        className="[--duration:20s] px-10"
        reverse={reverse}
      >
        {languages.map((lang) => (
          <LanguageCard key={lang.name} {...lang} />
        ))}
      </Marquee>
    </div>
  );
}

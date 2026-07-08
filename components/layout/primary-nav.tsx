"use client";

import { BookSearch, Info, NotebookPen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";
import { isActive } from "@/lib/urls";

export function PrimaryNav() {
  const t = useTranslations("homepage");
  const pathname = usePathname();

  const items = [
    { href: "/notebook", label: t("nav.my_notebooks"), icon: NotebookPen },
    { href: "/explore", label: t("nav.explore"), icon: BookSearch },
    { href: "/docs", label: t("about.title"), icon: Info },
  ];

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {items.map((item) => {
        const active = isActive(item.href, pathname, true);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

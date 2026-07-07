"use client";

import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
import { cn } from "@/lib/cn";

export function LanguageSelect() {
  const router = useRouter();
  const path = usePathname();
  const currentLocale = useLocale();

  function onValueChange(newLocale: string) {
    router.replace(newLocale);
  }

  return (
    <Select defaultValue={currentLocale} onValueChange={onValueChange}>
      <SelectTrigger
        className={cn("w-35", path !== `/${currentLocale}` && "hidden")}
      >
        <SelectValue placeholder="Idioma" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="pt-br">Português</SelectItem>
        <SelectItem value="en">English</SelectItem>
      </SelectContent>
    </Select>
  );
}

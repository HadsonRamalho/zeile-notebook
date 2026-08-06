"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "../ui/button";

export function BackButton({ showText = true }: { showText?: boolean }) {
  const t = useTranslations("back_button");
  const router = useRouter();

  return (
    <Button onClick={() => router.back()} className="hover:cursor-pointer">
      <ArrowLeft />
      {showText && t("back_button")}
    </Button>
  );
}

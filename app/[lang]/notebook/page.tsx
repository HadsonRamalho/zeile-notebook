"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useNotebookManager } from "@/components/notebook/notebook-manager";
import { Button } from "@/components/ui/button";

export default function NotebookHomePage() {
  const t = useTranslations("sidebar");
  const { createPage } = useNotebookManager();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center py-24">
      <h1 className="text-2xl font-semibold">{t("no_pages")}</h1>
      <p className="text-muted-foreground max-w-md">
        {t("empty_notebook_desc")}
      </p>
      <Button onClick={() => createPage()} className="gap-2">
        <Plus className="size-4" />
        {t("new_page")}
      </Button>
    </div>
  );
}

import { NotebookPen } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function GoToNotebooksButton({ className }: { className?: string }) {
  const t = useTranslations("sidebar");

  return (
    <Link
      href="/notebook"
      className={cn(
        "flex items-center justify-center gap-2 w-full rounded-lg border p-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
        className,
      )}
    >
      <NotebookPen className="size-4" />
      {t("go_to_notebooks")}
    </Link>
  );
}

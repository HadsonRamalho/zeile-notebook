import { Check, FileText, Pencil } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { DeletePageDialog } from "@/components/delete-page-dialog";
import { cn } from "@/lib/utils";
import type { NotebookMeta } from "@/lib/types";

interface PageSidebarProps {
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  page: NotebookMeta;
  renamePage?: (id: string, title: string) => Promise<void>;
  renameTeamPage?: (
    teamId: string,
    pageId: string,
    newTitle: string,
  ) => Promise<void>;
  teamId?: string;
  deleteTeamPage?: (teamId: string, pageId: string) => Promise<void>;
  onDeleteTeamPage?: (teamId: string) => void;
}

export function PageSidebar({
  editingId,
  setEditingId,
  page,
  renamePage,
  renameTeamPage,
  teamId,
  deleteTeamPage,
  onDeleteTeamPage,
}: PageSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [tempTitle, setTempTitle] = useState("");

  const handleStartEditing = (page: NotebookMeta) => {
    setEditingId(page.id);
    setTempTitle(page.title);
  };

  const handleSaveRename = async (id: string) => {
    if (tempTitle.trim() !== "" && renamePage) {
      await renamePage(id, tempTitle);
      setEditingId(null);
      return;
    }
    if (tempTitle.trim() !== "" && renameTeamPage && teamId) {
      await renameTeamPage(teamId, page.id, tempTitle);
      setEditingId(null);
      return;
    }
  };

  if (editingId === page.id) {
    return (
      <div className="flex items-center gap-1 p-1 w-full">
        <input
          className="bg-transparent border-b border-primary outline-none text-sm text-foreground w-full px-1"
          value={tempTitle}
          onChange={(e) => setTempTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveRename(page.id);
            if (e.key === "Escape") setEditingId(null);
          }}
        />
        <button
          type="button"
          onClick={() => handleSaveRename(page.id)}
          aria-label="Salvar nome"
          className="flex size-6 items-center justify-center rounded-md text-primary transition-colors hover:bg-accent"
        >
          <Check size={14} />
        </button>
      </div>
    );
  }

  const isActive = pathname === `/notebook/${page.id}`;

  return (
    <div className="group flex w-full items-center gap-1 rounded-md transition-colors hover:bg-accent">
      <button
        type="button"
        onClick={() => router.push(`/notebook/${page.id}`)}
        className={cn(
          "flex flex-1 min-w-0 items-center gap-2 rounded-md p-2 text-sm transition-colors hover:text-accent-foreground",
          isActive ? "text-primary font-medium" : "text-muted-foreground",
        )}
      >
        <FileText size={14} className="shrink-0" />
        <span className="truncate">{page.title}</span>
      </button>

      <div className="flex items-center gap-0.5 pr-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => handleStartEditing(page)}
          aria-label="Renomear página"
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-accent-foreground"
        >
          <Pencil size={12} />
        </button>
        <DeletePageDialog
          pageId={page.id}
          pageTitle={page.title}
          teamId={teamId}
          deleteTeamPage={deleteTeamPage}
          onDeleteTeamPage={onDeleteTeamPage}
        />
      </div>
    </div>
  );
}

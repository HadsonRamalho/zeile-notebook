import { Check, FileText, Pencil } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { DeletePageDialog } from "@/components/delete-page-dialog";
import { Button } from "@/components/ui/button";
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

  return (
    <div
      key={page.id}
      className=" w-full group flex items-center justify-between bg-card rounded-md pr-1"
    >
      {editingId === page.id ? (
        <div className="flex items-center gap-1 p-1 w-full">
          <input
            className="bg-transparent border-b border-emerald-500 outline-none text-sm text-foreground w-full px-1"
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
            className="text-emerald-500"
          >
            <Check size={14} />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between w-full group">
          <Button
            onClick={() => router.push(`/notebook/${page.id}`)}
            className={`flex-1 justify-start gap-2 p-2 w-full bg-card hover:bg-muted group-hover:bg-muted hover:cursor-pointer ${
              pathname === `/notebook/${page.id}`
                ? "text-sidebar-primary font-medium"
                : "text-muted-foreground"
            }`}
          >
            <FileText size={14} />
            <span className="truncate max-w-30">{page.title}</span>
          </Button>

          <div className="flex items-center md:opacity-0 group-hover:opacity-100 transition-opacity bg-card p-1 rounded-md">
            <button
              type="button"
              onClick={() => handleStartEditing(page)}
              className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:cursor-pointer"
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
      )}
    </div>
  );
}

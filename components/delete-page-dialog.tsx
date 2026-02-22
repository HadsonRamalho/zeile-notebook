"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useNotebookManager } from "./notebook/notebook-manager";

interface DeletePageDialogProps {
  pageId: string;
  pageTitle: string;
  teamId?: string;
  deleteTeamPage?: (teamId: string, pageId: string) => Promise<void>;
  onDeleteTeamPage?: (teamId: string) => void;
}

export function DeletePageDialog({
  pageId,
  pageTitle,
  teamId,
  deleteTeamPage,
  onDeleteTeamPage,
}: DeletePageDialogProps) {
  const { deletePage } = useNotebookManager();
  const [isOpen, setIsOpen] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (deleteTeamPage && onDeleteTeamPage && teamId) {
      await deleteTeamPage(teamId, pageId);
      onDeleteTeamPage(teamId);
      return;
    }
    deletePage(pageId);
  };

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(true);
          }}
          className="md:opacity-0 group-hover:opacity-100 hover:cursor-pointer p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
          title="Excluir página"
        >
          <Trash2 size={14} />
        </button>
      </AlertDialogTrigger>

      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação não pode ser desfeita. Isso excluirá permanentemente a
            página
            <span className="font-bold"> "{pageTitle}" </span>e todo o seu
            conteúdo do armazenamento local.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              setIsOpen(false);
            }}
            className="hover:cursor-pointer"
          >
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={async (e) => {
              await handleDelete(e);
              setIsOpen(false);
            }}
            className="bg-red-600 hover:bg-red-700 text-white border-none hover:cursor-pointer"
          >
            Sim, excluir página
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

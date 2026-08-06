"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";

export function DeleteAccountDialog() {
  const t = useTranslations("profile");

  const { deleteProfile } = useAuth();

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    await deleteProfile();
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="destructive"
          onClick={(e) => e.stopPropagation()}
          className="group-hover:opacity-100 hover:cursor-pointer p-1.5  hover:text-red-300 hover:bg-red-500/10 rounded transition-all"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t("danger_card.delete_account_button")}
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta ação não pode ser desfeita. Isso excluirá permanentemente todos
            os seus dados na plataforma.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel className="hover:cursor-pointer">
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-red-600 hover:bg-red-700 text-white border-none hover:cursor-pointer"
          >
            Sim, deletar minha conta
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

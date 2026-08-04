"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Save, Settings, Trash2 } from "lucide-react";
import { Loader } from "@/components/motion/loader";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { handleApiError } from "@/lib/api/handle-api-error";
import { deleteTeam, updateTeam } from "@/lib/api/teams-service";
import { getTeamFormSchema } from "@/lib/schemas/team-schemas";
import type { Team, TeamFormValues, TeamRole } from "@/lib/types/team-types";

type TeamDataProps = {
  isSaving: boolean;
  setIsSaving: (s: boolean) => void;
  teamId: string;
  setTeam: (t: Team | null) => void;
  team: Team | null;
  userPermissions: TeamRole | undefined;
};

export function TeamData({
  isSaving,
  setIsSaving,
  teamId,
  team,
  setTeam,
  userPermissions,
}: TeamDataProps) {
  const a = useTranslations("team_settings.team_data");
  const t = useTranslations("api_errors");
  const router = useRouter();

  const [isDeleting, setIsDeleting] = useState(false);

  const form = useForm<TeamFormValues>({
    resolver: zodResolver(getTeamFormSchema(a)),
    defaultValues: {
      name: "",
      description: "",
    },
    values: {
      name: team?.name || "",
      description: team?.description || "",
    },
    mode: "onChange",
  });

  async function onTeamSubmit(data: TeamFormValues) {
    setIsSaving(true);
    try {
      await updateTeam(teamId, data);

      toast.success(a("team_updated"));

      setTeam(
        team
          ? { ...team, name: data.name, description: data.description }
          : null,
      );

      form.reset(data);
    } catch (err) {
      handleApiError({ err, t });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteTeam() {
    setIsDeleting(true);
    try {
      await deleteTeam(teamId);

      toast.success(a("team_deleted"));

      router.push("/docs");
    } catch (err) {
      handleApiError({ err, t });
      setIsDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onTeamSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="size-5" />
                {a("title")}
              </CardTitle>
              <CardDescription>{a("description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  disabled={!userPermissions?.canManageTeam}
                  render={({ field }) => (
                    <FormItem className="col-span-1">
                      <FormLabel>{a("team_name")}</FormLabel>
                      <FormControl>
                        <Input placeholder={a("team_name")} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                disabled={!userPermissions?.canManageTeam}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{a("team_description")}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={a("team_description")}
                        className="min-h-25 resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            {userPermissions?.canManageTeam && (
              <CardFooter className="flex justify-end border-t px-6 py-4">
                <Button
                  type="submit"
                  disabled={
                    isSaving ||
                    !form.formState.isDirty ||
                    !userPermissions?.canManageTeam
                  }
                >
                  {isSaving && (
                    <Loader variant="spinner" size={16} className="mr-2" />
                  )}
                  {!isSaving && <Save className="mr-2 h-4 w-4" />}
                  {a("save_button")}
                </Button>
              </CardFooter>
            )}
          </Card>
        </form>
      </Form>

      {userPermissions?.canManageTeam && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="size-5" />
              {a("danger_zone")}
            </CardTitle>
            <CardDescription className="text-destructive/80">
              {a("danger_zone_description")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-medium">{a("danger_zone_delete_title")}</p>
                <p className="text-sm text-muted-foreground">
                  {a("danger_zone_delete_description")}
                </p>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="gap-2 shrink-0">
                    <Trash2 size={16} /> {a("danger_zone_delete_button")}
                  </Button>
                </AlertDialogTrigger>

                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-destructive">
                      {a("delete_team_confirm_title")}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {a.rich("delete_team_confirm_description", {
                        name: team?.name || "este time",
                        strong: (chunks) => <strong>{chunks}</strong>,
                      })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>
                      {a("cancel_button")}
                    </AlertDialogCancel>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteTeam}
                      disabled={isDeleting}
                    >
                      {isDeleting ? (
                        <Loader variant="spinner" size={16} className="mr-2" />
                      ) : (
                        <Trash2 className="mr-2 h-4 w-4" />
                      )}
                      {a("danger_zone_delete_button")}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

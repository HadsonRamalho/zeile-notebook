"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  Camera,
  Lock,
  Save,
  Settings,
  Upload,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { GithubIcon } from "@/components/icons/github-icon";
import { GoogleIcon } from "@/components/icons/google-icon";
import { BackButton } from "@/components/layout/back-button";
import { Loader } from "@/components/motion/loader";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/motion/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/context/auth-context";
import { updateProfile } from "@/lib/api/user-service";
import { profileSchema } from "@/schemas/user-schemas";
import type { ProfileFormValues } from "@/types/user-types";
import { DeleteAccountDialog } from "./delete-account-dialog";
import { ProfileConnections } from "./profile/profile-connections";
import { ProfileSecurityForm } from "./profile/profile-security-form";

export function ProfileForm() {
  const t = useTranslations("profile");

  const { user, isLoading: isAuthLoading } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "general" | "security" | "account"
  >("general");
  const canEditEmail = user?.primaryProvider === "Email";

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      email: "",
    },
    mode: "onChange",
  });

  useEffect(() => {
    if (user) {
      form.reset({
        name: user.name,
        email: user.email,
      });
    }
  }, [user, form]);

  async function onSubmit(data: ProfileFormValues) {
    setIsSaving(true);
    const result = await updateProfile(data);
    if (result.isErr()) {
      toast.error(
        result.error instanceof Error
          ? result.error.message
          : t("profile_card.profile_update_error"),
      );
    } else {
      toast.success(t("profile_card.profile_updated"));
    }
    setIsSaving(false);
  }

  if (isAuthLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader variant="spinner" size={16} />
      </div>
    );
  }

  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-2 text-center sm:text-left">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("title")}</h2>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex items-start justify-start">
          <BackButton />
        </div>
      </div>

      <Separator />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        variant="pill"
        className="w-full"
      >
        <TabsList className="w-fit">
          <TabsTrigger
            value="general"
            className="gap-2"
            indicatorClassName="bg-primary"
          >
            <Settings size={16} />
            {t("tabs.general")}
          </TabsTrigger>
          {canEditEmail && (
            <TabsTrigger
              value="security"
              className="gap-2"
              indicatorClassName="bg-primary"
            >
              <Lock size={16} />
              {t("tabs.security")}
            </TabsTrigger>
          )}
          <TabsTrigger
            value="account"
            className="gap-2"
            indicatorClassName="bg-primary"
          >
            <AlertTriangle size={16} />
            {t("tabs.account")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="w-full">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="size-5" />
                    {t("profile_card.title")}
                  </CardTitle>
                  <CardDescription>
                    {t("profile_card.description")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-col items-center gap-4 sm:flex-row">
                    <div className="relative group cursor-pointer">
                      <Avatar className="h-24 w-24 border-2 border-border group-hover:opacity-75 transition-opacity">
                        <AvatarImage src={user?.avatarUrl || ""} />
                        <AvatarFallback className="text-2xl">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 rounded-full transition-opacity text-white">
                        <Camera className="h-6 w-6" />
                      </div>
                    </div>
                    <div className="text-center sm:text-left">
                      <h3 className="font-medium text-lg">{user?.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {user?.email}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        type="button"
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        {t("profile_card.update_image")}
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("profile_card.full_name")}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={t("profile_card.full_name")}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>{t("profile_card.email")}</FormLabel>
                            {!canEditEmail && (
                              <span className="text-xs font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-full flex items-center gap-1">
                                {user?.primaryProvider === "Google" && (
                                  <GoogleIcon />
                                )}
                                {user?.primaryProvider === "Github" && (
                                  <GithubIcon />
                                )}
                                {t("profile_card.linked_to")}
                                {user?.primaryProvider}
                              </span>
                            )}
                          </div>

                          <FormControl>
                            <div className="relative">
                              <Input
                                placeholder={t("profile_card.email")}
                                {...field}
                                disabled={!canEditEmail}
                                className={
                                  !canEditEmail
                                    ? "bg-muted text-muted-foreground pr-10"
                                    : ""
                                }
                              />
                              {!canEditEmail && (
                                <Lock className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground opacity-50" />
                              )}
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
                <CardFooter className="grid grid-cols-1 gap-4 md:flex justify-end border-t px-6 py-4">
                  <Button
                    type="submit"
                    disabled={isSaving || !form.formState.isDirty}
                  >
                    {isSaving && (
                      <Loader variant="spinner" size={16} className="mr-2" />
                    )}
                    {!isSaving && <Save className="mr-2 h-4 w-4" />}
                    {t("profile_card.save")}
                  </Button>
                </CardFooter>
              </Card>
            </form>
          </Form>
        </TabsContent>

        {canEditEmail && (
          <TabsContent value="security" className="w-full">
            <ProfileSecurityForm />
          </TabsContent>
        )}

        <TabsContent value="account" className="w-full space-y-6">
          <ProfileConnections />

          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <AlertTriangle className="size-5" />
                {t("danger_card.title")}
              </CardTitle>
              <CardDescription className="text-destructive/80">
                {t("danger_card.description")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:flex items-center justify-between">
                <div className="space-y-1">
                  <p className="font-medium">
                    {t("danger_card.delete_account")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("danger_card.delete_account_description")}
                  </p>
                </div>
                <DeleteAccountDialog />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

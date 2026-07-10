"use client";

import { Home, KeyRound, Settings, Shield, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BackButton } from "@/components/interface/back-button";
import { Loader } from "@/components/motion/loader";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/motion/tabs";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { handleApiError } from "@/lib/api/handle-api-error";
import {
  fetchTeam,
  fetchTeamMembers,
  fetchTeamRoles,
  getUserTeamPermissions,
} from "@/lib/api/teams-service";
import type {
  Team,
  TeamMemberWithUserData,
  TeamRole,
} from "@/lib/types/team-types";
import { TeamData } from "./team-data";
import { TeamMembers } from "./team-members";
import { TeamPermissions } from "./team-permissions";
import { TeamRoles } from "./team-roles";

interface TeamSettingsFormProps {
  teamId: string;
}

export default function TeamSettingsForm({ teamId }: TeamSettingsFormProps) {
  const t = useTranslations("team_settings.team_form");

  const [activeTab, setActiveTab] = useState<
    "general" | "members" | "roles" | "permissions"
  >("general");

  const [team, setTeam] = useState<Team | null>(null);
  const [roles, setRoles] = useState<TeamRole[]>([]);
  const [members, setMembers] = useState<[TeamMemberWithUserData, TeamRole][]>(
    [],
  );

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [userPermissions, setUserPermissions] = useState<TeamRole | undefined>(
    undefined,
  );

  const reloadTeamRoles = async () => {
    try {
      const tempRoles = await fetchTeamRoles(teamId);
      setRoles(tempRoles);
    } catch (err) {
      handleApiError({ err, t });
    }
  };

  const reloadTeamMembers = async () => {
    try {
      const tempMembers = await fetchTeamMembers(teamId);
      setMembers(tempMembers);
    } catch (err) {
      handleApiError({ err, t });
    }
  };

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      getUserTeamPermissions(teamId),
      fetchTeam(teamId),
      fetchTeamMembers(teamId),
    ])
      .then(async ([p, t, m]) => {
        const fetchedPermissions = p[1];

        setUserPermissions(fetchedPermissions);
        setTeam(t);
        setMembers(m);

        if (fetchedPermissions?.can_manage_permissions) {
          const r = await fetchTeamRoles(teamId);
          setRoles(r);
        } else {
          setRoles([]);
        }
      })
      .catch(() => {
        toast.error("Erro ao carregar dados do time.");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [teamId]);

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader variant="spinner" size={32} className="text-muted-foreground" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="flex h-[50vh] flex-col gap-4 items-center justify-center text-muted-foreground">
        <span> {t("team_not_found")}</span>
        <Button asChild className="flex">
          <Link href="/docs">
            <Home className="size-4" />
            {t("back_to_home")}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col space-y-2 text-center sm:text-left">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{team.name}</h2>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <div className="flex justify-start">
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
            {t("general_tab")}
          </TabsTrigger>
          <TabsTrigger
            value="members"
            className="gap-2"
            indicatorClassName="bg-primary"
          >
            <Users size={16} />
            {t("member_tab")}
          </TabsTrigger>
          {roles.length > 0 && (
            <TabsTrigger
              value="roles"
              className="gap-2"
              indicatorClassName="bg-primary"
            >
              <Shield size={16} />
              {t("role_tab")}
            </TabsTrigger>
          )}
          {roles.length > 0 && (
            <TabsTrigger
              value="permissions"
              className="gap-2"
              indicatorClassName="bg-primary"
            >
              <KeyRound size={16} />
              Permissões
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="general" className="w-full">
          <TeamData
            isSaving={isSaving}
            setIsSaving={setIsSaving}
            teamId={teamId}
            setTeam={setTeam}
            team={team}
            userPermissions={userPermissions}
          />
        </TabsContent>

        <TabsContent value="members" className="w-full">
          <TeamMembers
            teamId={teamId}
            userPermissions={userPermissions}
            roles={roles}
            members={members}
            onUpdate={reloadTeamMembers}
          />
        </TabsContent>

        {roles.length > 0 && (
          <TabsContent value="roles" className="w-full">
            <TeamRoles
              roles={roles}
              teamId={teamId}
              onUpdate={reloadTeamRoles}
            />
          </TabsContent>
        )}

        {roles.length > 0 && (
          <TabsContent value="permissions" className="w-full">
            <TeamPermissions teamId={teamId} roles={roles} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

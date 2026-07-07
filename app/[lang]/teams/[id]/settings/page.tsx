import { use } from "react";
import { AppShell } from "@/components/layout/app-shell";
import TeamSettingsForm from "@/components/interface/team-settings/team-settings-form";
import { baseOptions } from "@/lib/layout.shared";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function TeamManagementPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const teamId = resolvedParams.id;

  return (
    <AppShell nav={baseOptions({ variant: "global" }).nav?.component}>
      <div className="max-w-5xl md:min-w-3xl mx-auto p-2 pt-20 md:p-6 md:pt-24 space-y-6">
        <TeamSettingsForm teamId={teamId} />
      </div>
    </AppShell>
  );
}

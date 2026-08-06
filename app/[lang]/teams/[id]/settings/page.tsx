import { use } from "react";
import TeamSettingsForm from "@/features/settings/components/team-settings/team-settings-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function TeamManagementPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const teamId = resolvedParams.id;

  return (
    <div className="max-w-5xl md:min-w-3xl mx-auto p-2 pt-10 md:p-6 md:pt-10 space-y-6">
      <TeamSettingsForm teamId={teamId} />
    </div>
  );
}

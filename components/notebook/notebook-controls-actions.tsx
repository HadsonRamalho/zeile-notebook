import {
  Copy,
  Globe,
  KeyRound,
  Lock,
  Presentation,
  Share2,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Loader } from "@/components/motion/loader";
import { Dock, DockIcon } from "@/components/ui/dock";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ControlRules = {
  showPrivacySelector: boolean;
  showClone: boolean;
  showShare: boolean;
  showExport: boolean;
  showPublicPerms: boolean;
  showTeamPerms: boolean;
  showPresent: boolean;
};

interface ControlActionsProps {
  rules: ControlRules;
  isPublic: boolean;
  isCloning: boolean;
  onToggleVisibility: (isPublic: boolean) => void;
  onClone: () => void;
  onShare: () => void;
  onPresent: () => void;
  presentLabel: string;
  exportMenu: ReactNode;
  onManagePublic: () => void;
  onManageTeamPerms: () => void;
}

function DockAction({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DockIcon
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-disabled={disabled}
          onClick={disabled ? undefined : onClick}
          onKeyDown={(e) => {
            if (!disabled && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              onClick();
            }
          }}
          aria-label={label}
          className="text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          {icon}
        </DockIcon>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function ControlActions({
  rules,
  isPublic,
  isCloning,
  onToggleVisibility,
  onClone,
  onShare,
  onPresent,
  presentLabel,
  exportMenu,
  onManagePublic,
  onManageTeamPerms,
}: ControlActionsProps) {
  const t = useTranslations("notebook_controls");
  const tp = useTranslations("team_settings.team_role");

  const hasAny =
    rules.showPrivacySelector ||
    rules.showClone ||
    rules.showShare ||
    rules.showExport ||
    rules.showPublicPerms ||
    rules.showTeamPerms ||
    rules.showPresent;

  if (!hasAny) return null;

  return (
    <Dock
      iconSize={40}
      iconMagnification={52}
      className="mt-0 border-border bg-card supports-backdrop-blur:bg-card/80"
    >
      {rules.showPrivacySelector && (
        <DockAction
          icon={
            isPublic ? (
              <Users className="size-4" />
            ) : (
              <Lock className="size-4" />
            )
          }
          label={isPublic ? t("public") : t("private")}
          onClick={() => onToggleVisibility(!isPublic)}
        />
      )}

      {rules.showClone && (
        <DockAction
          icon={
            isCloning ? (
              <Loader variant="spinner" size={16} />
            ) : (
              <Copy className="size-4" />
            )
          }
          label={t("clone")}
          onClick={onClone}
          disabled={isCloning}
        />
      )}

      {rules.showShare && (
        <DockAction
          icon={<Share2 className="size-4" />}
          label={t("share")}
          onClick={onShare}
        />
      )}

      {rules.showExport && exportMenu}

      {rules.showTeamPerms && (
        <DockAction
          icon={<KeyRound className="size-4" />}
          label={tp("notebook_permissions")}
          onClick={onManageTeamPerms}
        />
      )}

      {rules.showPublicPerms && (
        <DockAction
          icon={<Globe className="size-4" />}
          label={tp("public_permissions")}
          onClick={onManagePublic}
        />
      )}

      {rules.showPresent && (
        <DockAction
          icon={<Presentation className="size-4" />}
          label={presentLabel}
          onClick={onPresent}
        />
      )}
    </Dock>
  );
}

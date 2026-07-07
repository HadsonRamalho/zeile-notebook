import { Copy, Lock, Printer, Share2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Dock, DockIcon } from "@/components/ui/dock";
import { Loader } from "@/components/motion/loader";
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
};

interface ControlActionsProps {
  rules: ControlRules;
  isPublic: boolean;
  isCloning: boolean;
  onToggleVisibility: (isPublic: boolean) => void;
  onClone: () => void;
  onShare: () => void;
  onExport: () => void;
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
  onExport,
}: ControlActionsProps) {
  const t = useTranslations("notebook_controls");

  const hasAny =
    rules.showPrivacySelector ||
    rules.showClone ||
    rules.showShare ||
    rules.showExport;

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

      {rules.showExport && (
        <DockAction
          icon={<Printer className="size-4" />}
          label={t("pdf")}
          onClick={onExport}
        />
      )}
    </Dock>
  );
}

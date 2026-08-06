import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Lightbulb,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { CalloutContainerProps, CalloutType } from "@/types/block-types";

const styles: Record<CalloutType, string> = {
  info: "border-l-blue-500 bg-blue-500/5",
  idea: "border-l-primary bg-primary/5",
  warn: "border-l-amber-500 bg-amber-500/5",
  warning: "border-l-amber-500 bg-amber-500/5",
  error: "border-l-destructive bg-destructive/5",
  success: "border-l-emerald-500 bg-emerald-500/5",
};

const icons: Record<CalloutType, ReactNode> = {
  info: <Info className="size-4 text-blue-500" />,
  idea: <Lightbulb className="size-4 text-primary" />,
  warn: <AlertTriangle className="size-4 text-amber-500" />,
  warning: <AlertTriangle className="size-4 text-amber-500" />,
  error: <XCircle className="size-4 text-destructive" />,
  success: <CheckCircle2 className="size-4 text-emerald-500" />,
};

export function Callout({
  type = "info",
  icon,
  title,
  children,
  className,
  ...props
}: { title?: ReactNode } & Omit<CalloutContainerProps, "title">) {
  return (
    <div
      className={cn(
        "my-4 flex flex-col gap-2 rounded-md border-l-4 border-border bg-muted/30 p-4 text-sm",
        styles[type],
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2 font-medium">
        {icon ?? icons[type]}
        {title}
      </div>
      <div className="text-muted-foreground [&_p]:m-0">{children}</div>
    </div>
  );
}

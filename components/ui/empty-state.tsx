import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  hint?: string;
  children?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  hint,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-5 text-center",
        className,
      )}
    >
      {icon && (
        <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-muted/40 text-primary">
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="max-w-md text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {children}
        </div>
      )}
      {hint && (
        <p className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

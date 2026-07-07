import type { HTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Cards(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn("my-4 grid grid-cols-1 gap-4 sm:grid-cols-2", props.className)}
    />
  );
}

export type CardProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  href?: string;
  external?: boolean;
};

export function Card({
  icon,
  title,
  description,
  href,
  external,
  className,
  children,
  ...props
}: CardProps) {
  const content = (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card p-4 text-sm shadow-sm transition-colors",
        href && "hover:border-primary",
        className,
      )}
      {...props}
    >
      {icon}
      <div className="font-medium">{title}</div>
      {description && (
        <p className="text-muted-foreground m-0">{description}</p>
      )}
      {children}
    </div>
  );

  if (!href) return content;

  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
    >
      {content}
    </Link>
  );
}

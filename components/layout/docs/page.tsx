"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { type ComponentProps, Fragment, type ReactNode } from "react";
import { useTreePath } from "@/lib/tree-context";
import { cn, type TOCItemType } from "@/lib/utils";

export function PageBreadcrumb() {
  const path = useTreePath();
  const items = path.slice(0, -1);

  if (items.length === 0) return null;

  return (
    <div className="mb-4 flex items-center gap-1.5 text-sm text-fd-muted-foreground">
      {items.map((item, i) => (
        <Fragment key={i}>
          {i !== 0 && <ChevronRight className="size-3.5 shrink-0" />}
          {item.type === "page" ? (
            <Link href={item.url} className="truncate hover:opacity-80">
              {item.name}
            </Link>
          ) : (
            <span className="truncate">{item.name}</span>
          )}
        </Fragment>
      ))}
    </div>
  );
}

export function DocsPage({
  children,
}: {
  toc?: TOCItemType[];
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-6 md:px-8 md:py-10">
      <article className="min-w-0 w-full">
        <div className="max-w-[850px]">
          <PageBreadcrumb />
        </div>
        {children}
      </article>
    </div>
  );
}

export function DocsTitle({
  children,
  className,
  ...props
}: ComponentProps<"h1">) {
  return (
    <h1 {...props} className={cn("text-[1.75em] font-semibold", className)}>
      {children}
    </h1>
  );
}

export function DocsDescription({
  children,
  className,
  ...props
}: ComponentProps<"p">) {
  if (children === undefined) return null;

  return (
    <p
      {...props}
      className={cn("mb-8 text-lg text-fd-muted-foreground", className)}
    >
      {children}
    </p>
  );
}

export function DocsBody({
  children,
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div {...props} className={cn("prose flex-1", className)}>
      {children}
    </div>
  );
}

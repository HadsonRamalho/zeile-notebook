"use client";

import { NotebookPen } from "lucide-react";
import Link from "next/link";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { useAuth } from "@/context/auth-context";

export function NotebooksCta({ label }: { label: string }) {
  const { user, isLoading } = useAuth();

  if (isLoading || !user) return null;

  return (
    <Link href="/notebook">
      <ShimmerButton
        background="var(--primary)"
        className="shadow-2xl h-14 px-8 text-sm font-bold w-full"
      >
        <span className="flex items-center gap-2 text-primary-foreground">
          <NotebookPen className="h-4 w-4" />
          {label}
        </span>
      </ShimmerButton>
    </Link>
  );
}

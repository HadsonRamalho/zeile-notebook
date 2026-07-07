"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Loader } from "./loader";

export interface HelixPercentLoaderProps {
  size?: number;
  speed?: number;
  label?: string;
  className?: string;
}

export function HelixPercentLoader({
  size = 48,
  speed = 1.4,
  label = "Carregando",
  className,
}: HelixPercentLoaderProps) {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const durationMs = speed * 1000;
    const tickMs = 40;
    let elapsed = 0;

    const id = setInterval(() => {
      elapsed += tickMs;
      const next = Math.min(100, Math.round((elapsed / durationMs) * 100));
      setPercent(next);
      if (next >= 100) elapsed = 0;
    }, tickMs);

    return () => clearInterval(id);
  }, [speed]);

  return (
    <span className={cn("flex flex-col items-center gap-2", className)}>
      <Loader variant="helix" size={size} speed={speed} label={label} />
      <span aria-hidden className="font-mono text-sm tabular-nums text-muted-foreground">
        {percent}%
      </span>
    </span>
  );
}

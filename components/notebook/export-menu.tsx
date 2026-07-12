"use client";

import { Download } from "lucide-react";
import { Loader } from "@/components/motion/loader";
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ExportFormat } from "@/lib/export";

export interface ExportOption {
  format: ExportFormat;
  label: string;
}

export function ExportMenu({
  options,
  busy,
  triggerLabel,
  onExport,
}: {
  options: ExportOption[];
  busy: boolean;
  triggerLabel: string;
  onExport: (format: ExportFormat) => void;
}) {
  if (options.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={triggerLabel}
          title={triggerLabel}
          disabled={busy}
          className="flex size-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          {busy ? (
            <Loader variant="spinner" size={16} />
          ) : (
            <Download className="size-4" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex flex-col gap-0.5">
        {options.map((option) => (
          <PopoverClose asChild key={option.format}>
            <button
              type="button"
              onClick={() => onExport(option.format)}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {option.label}
            </button>
          </PopoverClose>
        ))}
      </PopoverContent>
    </Popover>
  );
}

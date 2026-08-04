"use client";

import { useEffect, useState } from "react";
import {
  type CapabilitiesReport,
  fetchExecutionCapabilities,
} from "@/lib/api/capabilities-service";

let cache: CapabilitiesReport | null = null;
let inFlight: Promise<CapabilitiesReport> | null = null;

function load(): Promise<CapabilitiesReport> {
  if (cache) return Promise.resolve(cache);
  if (!inFlight) {
    inFlight = fetchExecutionCapabilities()
      .then((report) => {
        cache = report;
        return report;
      })
      .catch(() => {
        // fails open: an unreachable /capabilities must not block every exec block
        const fallback: CapabilitiesReport = { sandbox: true, languages: [] };
        cache = fallback;
        return fallback;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

export interface ExecutionCapabilities {
  ready: boolean;
  isLanguageAvailable: (language: string) => boolean;
  missingFor: (language: string) => string[];
}

export function useExecutionCapabilities(): ExecutionCapabilities {
  const [report, setReport] = useState<CapabilitiesReport | null>(cache);

  useEffect(() => {
    let active = true;
    load().then((r) => {
      if (active) setReport(r);
    });
    return () => {
      active = false;
    };
  }, []);

  const isLanguageAvailable = (language: string) => {
    const found = report?.languages.find((l) => l.language === language);
    return found ? found.available : true;
  };

  const missingFor = (language: string) =>
    report?.languages.find((l) => l.language === language)?.missing ?? [];

  return { ready: report !== null, isLanguageAvailable, missingFor };
}

import { useEffect, useRef, useState } from "react";
import type { Notebook } from "@/lib/types";

export interface HistorySnapshot {
  timestamp: Date;
  doc: Notebook;
}

export function useLocalHistory(currentDoc: Notebook | null) {
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const lastSavedDoc = useRef<Notebook | null>(null);

  useEffect(() => {
    if (!currentDoc) return;

    const interval = setInterval(() => {
      if (currentDoc !== lastSavedDoc.current) {
        setHistory((prev) => [
          { timestamp: new Date(), doc: currentDoc },
          ...prev,
        ]);
        lastSavedDoc.current = currentDoc;
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [currentDoc]);

  return { history };
}

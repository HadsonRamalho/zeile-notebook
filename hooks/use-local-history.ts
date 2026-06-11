import { useEffect, useRef, useState } from "react";
import type { Notebook } from "@/lib/types";

export interface HistorySnapshot {
  timestamp: Date;
  doc: Notebook;
}

export function useLocalHistory(currentDoc: Notebook | null) {
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const lastSavedContent = useRef<string | null>(null);

  useEffect(() => {
    if (!currentDoc) return;

    const currentBlocksAndTitle = JSON.stringify({
      blocks: currentDoc.blocks,
      title: currentDoc.title,
    });

    if (lastSavedContent.current === null) {
      lastSavedContent.current = currentBlocksAndTitle;
      return;
    }

    const interval = setInterval(() => {
      const currentContent = JSON.stringify({
        blocks: currentDoc.blocks,
        title: currentDoc.title,
      });

      if (currentContent !== lastSavedContent.current) {
        setHistory((prev) => [
          {
            timestamp: new Date(),
            doc: JSON.parse(JSON.stringify(currentDoc)),
          },
          ...prev,
        ]);
        lastSavedContent.current = currentContent;
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [currentDoc]);

  return { history };
}

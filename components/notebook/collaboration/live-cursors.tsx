import { motion } from "framer-motion";
import { useRef } from "react";
import type { Collaborator } from "@/hooks/use-presence";
import { cn } from "@/lib/utils";

export function LiveCursors({
  collaborators,
}: {
  collaborators: Collaborator[];
}) {
  const seenIds = useRef<Set<string>>(new Set());

  return (
    <div className="print:hidden pointer-events-none fixed inset-0 z-overlay overflow-hidden">
      {collaborators.map((collab) => {
        if (!collab.cursor) return null;

        const isNew = !seenIds.current.has(collab.id);
        if (isNew) seenIds.current.add(collab.id);

        return (
          <motion.div
            key={collab.id}
            className="absolute top-0 left-0 flex flex-col pointer-events-none"
            animate={{ x: collab.cursor.x, y: collab.cursor.y }}
            transition={{
              type: "spring",
              damping: 30,
              mass: 0.8,
              stiffness: 250,
            }}
          >
            <span
              className={cn(
                "absolute left-0 top-0 size-2 rounded-full",
                isNew && "animate-presence-pulse",
              )}
            />
            <CursorIcon color={collab.color} />
            <div
              className="ml-4 mt-1 rounded-md px-2 py-1 text-xs font-medium text-white whitespace-nowrap shadow-md"
              style={{ backgroundColor: collab.color }}
            >
              {collab.name}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function CursorIcon({ color }: { color: string }) {
  return (
    <svg
      className="size-6 drop-shadow-md"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
    >
      <path
        fill={color}
        d="M1.8 4.4 7 36.2c.3 1.8 2.6 2.3 3.6.8l3.9-5.7c1.7-2.5 4.5-4.1 7.5-4.3l6.9-.5c1.8-.1 2.5-2.4 1.1-3.5L5 2.5c-1.4-1.1-3.5 0-3.3 1.9Z"
      />
    </svg>
  );
}

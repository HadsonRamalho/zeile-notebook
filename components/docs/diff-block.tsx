import type { ReactNode } from "react";

interface DiffBlockProps {
  children: ReactNode;
  type: "removed" | "added";
  label?: string;
}

export function DiffBlock({ children, type, label }: DiffBlockProps) {
  const isOld = type === "removed";

  return (
    <div
      className={`
      border-l-4 p-2 my-0
      ${
        isOld
          ? "rounded-t-lg border-red-500 bg-red-50 dark:bg-red-800/20 opacity-80"
          : "rounded-b-lg border-green-500 bg-green-50 dark:bg-green-950/20"
      }
    `}
    >
      <span
        className={`font-bold ml-2 text-sm ${isOld ? "text-red-500" : "text-green-600"}`}
      >
        {isOld ? "-" : "+"} {label || (isOld ? "Original" : "Sugestão")}:
      </span>
      <div className="mt-2 prose-sm md:prose">{children}</div>
    </div>
  );
}

import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { RunStatus } from "@/lib/types";

interface EditorConsoleProps {
  status: RunStatus;
  output?: string;
}

export function EditorConsole({ status, output }: EditorConsoleProps) {
  return (
    <div className="border-t border-border dark:bg-[#0f0f0f] print:hidden">
      <div className="flex items-center justify-between px-4 py-2 dark:bg-[#1a1a1a] border-b border-border">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          Console
        </span>
        {status !== "idle" && (
          <div
            className={`flex items-center gap-1.5 text-[12px] font-bold uppercase ${
              status === "success" ? "text-emerald-500" : "text-red-500"
            }`}
          >
            {status === "success" ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertCircle size={16} />
            )}
            {status === "success" ? "Sucesso" : "Falha"}
          </div>
        )}
      </div>
      <div className="p-4 font-mono text-sm min-h-20 max-h-60 overflow-y-auto custom-scrollbar print:hidden">
        {output ? (
          <pre
            className={`whitespace-pre-wrap ${
              status === "error" ? "text-red-400" : "text-gray-300"
            }`}
          >
            {output}
          </pre>
        ) : (
          <span className="text-muted-foreground italic">
            Aguardando execução...
          </span>
        )}
      </div>
    </div>
  );
}

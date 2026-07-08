import { Play } from "lucide-react";
import { Loader } from "@/components/motion/loader";

interface RunButtonProps {
  isRunning: boolean;
  handleRun: () => void;
  isLoading: boolean;
}

export function RunButton({ isRunning, handleRun, isLoading }: RunButtonProps) {
  return (
    <button
      type="button"
      disabled={isRunning || isLoading}
      onClick={handleRun}
      className={`
      flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all print:hidden
      ${
        isRunning || isLoading
          ? "bg-muted text-accent-violet cursor-not-allowed"
          : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95"
      }`}
    >
      {isRunning ? (
        <Loader variant="spinner" size={14} />
      ) : (
        <Play className="size-3.5 fill-current" />
      )}
      {isRunning ? "Compilando..." : "Executar"}
    </button>
  );
}

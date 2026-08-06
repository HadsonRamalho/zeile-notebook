"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  BarChart3,
  Box,
  ChevronLeft,
  Cpu,
  Database,
  FileCode,
  IdCard,
  Info,
  Link2,
  Loader,
  MoreHorizontal,
  Pencil,
  Plus,
  Puzzle,
  ScrollText,
  Shapes,
  Sigma,
  TableProperties,
  Terminal,
  Waypoints,
  Workflow,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { CppIcon } from "@/components/icons/cpp-icon";
import { GithubIcon } from "@/components/icons/github-icon";
import { GoIcon } from "@/components/icons/go-icon";
import { PythonIcon } from "@/components/icons/python-icon";
import { ReactIcon } from "@/components/icons/react-icon";
import { RustIcon } from "@/components/icons/rust-icon";
import { ZigIcon } from "@/components/icons/zig-icon";
import { cn } from "@/lib/utils";
import type { BlockMetadata, BlockType, Language } from "@/types/block-types";
import { useCan } from "../permissions/capabilities";

interface ReorderToolsProps {
  index: number;
  addBlock: (
    index: number,
    type: BlockType,
    language?: Language,
    metadata?: BlockMetadata,
  ) => void;
}

type ToolButtonConfig = {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  targetView?: string;
  permType?: string;
};

// Divider always present between blocks (and at the end of the list) —
// previously the trigger only existed via hover, which doesn't work on
// touch and made the tap land on the block behind it (nothing was actually
// mounted there until hover fired). Now the "+" button always exists in the
// layout (not absolutely positioned over other content) and opens/closes on
// click/tap in both cases — hover only increases opacity on desktop, it's
// not a functional requirement.
export function ReorderTools({ index, addBlock }: ReorderToolsProps) {
  const can = useCan();
  const canAddButton = (btn: ToolButtonConfig) => {
    if (btn.targetView) return true;
    const key = btn.permType
      ? `notebook.blocks.${btn.permType}.add`
      : "notebook.blocks.add";
    return can(key, { blockType: btn.permType });
  };

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<string>("main");
  const containerRef = useRef<HTMLDivElement>(null);

  const resetView = useCallback(() => setView("main"), []);

  const close = useCallback(() => {
    setOpen(false);
    resetView();
  }, [resetView]);

  // Fecha ao clicar/tocar fora ou apertar Escape — mesmo comportamento em
  // mouse e touch, sem depender de hover.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const menuRegistry: Record<
    string,
    { buttons: ToolButtonConfig[]; parent?: string }
  > = {
    main: {
      buttons: [
        {
          label: "Texto",
          icon: <Plus size={14} />,
          onClick: () => addBlock(index, "text"),
          permType: "text",
        },
        {
          label: "Código",
          icon: <Terminal size={14} />,
          targetView: "languages",
        },
        {
          label: "Interface",
          icon: <Loader size={14} />,
          targetView: "ui",
        },
        {
          label: "Outros",
          icon: <Shapes size={14} />,
          targetView: "outros",
        },
      ],
    },
    outros: {
      parent: "main",
      buttons: [
        {
          label: "Diagramas",
          icon: <Waypoints size={14} />,
          targetView: "diagrams",
        },
        {
          label: "LaTeX",
          icon: <Sigma size={14} />,
          onClick: () => addBlock(index, "latex"),
          permType: "latex",
        },
        {
          label: "SQL",
          icon: <TableProperties size={14} />,
          onClick: () => addBlock(index, "sql"),
          permType: "sql",
        },
        {
          label: "Gráfico",
          icon: <BarChart3 size={14} />,
          onClick: () => addBlock(index, "chart"),
        },
        {
          label: "Mermaid",
          icon: <Workflow size={14} />,
          onClick: () => addBlock(index, "mermaid"),
        },
        {
          label: "Typst",
          icon: <ScrollText size={14} />,
          onClick: () => addBlock(index, "typst"),
          permType: "typst",
        },
        {
          label: "Desafio",
          icon: <Puzzle size={14} />,
          onClick: () => addBlock(index, "challenge"),
          permType: "challenge",
        },
        {
          label: "Referência",
          icon: <Link2 size={14} />,
          onClick: () => addBlock(index, "notebook_ref"),
          permType: "notebook_ref",
        },
        {
          label: "Template",
          icon: <FileCode size={14} />,
          onClick: () => addBlock(index, "template_ref"),
          permType: "template_ref",
        },
      ],
    },
    diagrams: {
      parent: "outros",
      buttons: [
        {
          label: "Desenho",
          icon: <Pencil size={14} />,
          onClick: () => addBlock(index, "free_drawing"),
          permType: "drawing",
        },
        {
          label: "Excalidraw",
          icon: <Waypoints size={14} />,
          onClick: () => addBlock(index, "drawing"),
          permType: "drawing",
        },
        {
          label: "Database Schema",
          icon: <Database size={14} />,
          onClick: () => addBlock(index, "database_schema"),
          permType: "database_schema",
        },
      ],
    },
    languages: {
      parent: "main",
      buttons: [
        {
          label: "Rust",
          icon: <RustIcon size={30} />,
          onClick: () => addBlock(index, "code", "rust"),
          permType: "rust",
        },
        {
          label: "React/TS",
          icon: <ReactIcon size={24} />,
          onClick: () => addBlock(index, "code", "typescript"),
          permType: "tsx",
        },
        {
          label: "Python",
          icon: <PythonIcon size={24} />,
          onClick: () => addBlock(index, "code", "python"),
          permType: "python",
        },
        {
          label: "Mais",
          icon: <MoreHorizontal size={24} />,
          targetView: "languages_more",
        },
      ],
    },
    languages_more: {
      parent: "languages",
      buttons: [
        {
          label: "Go",
          icon: <GoIcon size={30} />,
          onClick: () => addBlock(index, "code", "go"),
          permType: "go",
        },
        {
          label: "C++",
          icon: <CppIcon size={30} />,
          onClick: () => addBlock(index, "code", "cpp"),
          permType: "cpp",
        },
        {
          label: "Zig",
          icon: <ZigIcon size={24} />,
          onClick: () => addBlock(index, "code", "zig"),
          permType: "zig",
        },
        {
          label: "Genérico",
          icon: <Cpu size={24} />,
          onClick: () => addBlock(index, "code", "generic"),
        },
      ],
    },
    ui: {
      parent: "main",
      buttons: [
        {
          label: "Callout",
          icon: <Info size={14} />,
          targetView: "ui_callout",
        },
        {
          label: "Card",
          icon: <Box size={14} />,
          onClick: () =>
            addBlock(index, "component", undefined, {
              type: "card",
              props: { title: "" },
            }),
        },
        {
          label: "Banner",
          icon: <IdCard size={14} />,
          targetView: "ui_banner",
        },
        {
          label: "Github Repo",
          icon: <GithubIcon />,
          onClick: () =>
            addBlock(index, "component", undefined, {
              type: "github_repo",
              props: { owner: "HadsonRamalho", repo: "docs" },
            }),
        },
      ],
    },
    ui_banner: {
      parent: "ui",
      buttons: [
        {
          label: "Banner Normal",
          icon: <IdCard size={14} />,
          onClick: () =>
            addBlock(index, "component", undefined, {
              type: "banner",
              variant: "normal",
            }),
        },
        {
          label: "Banner Arco-íris",
          icon: <IdCard size={14} />,
          onClick: () =>
            addBlock(index, "component", undefined, {
              type: "banner",
              variant: "rainbow",
            }),
        },
      ],
    },
    ui_callout: {
      parent: "ui",
      buttons: [
        {
          label: "Info",
          icon: <Info size={14} />,
          onClick: () => addCallout("info"),
        },
        {
          label: "Aviso",
          icon: <Zap size={14} />,
          onClick: () => addCallout("warn"),
        },
        {
          label: "Erro",
          icon: <AlertCircle size={14} />,
          onClick: () => addCallout("error"),
        },
      ],
    },
  };

  const addCallout = (type: "info" | "warn" | "error") => {
    addBlock(index, "component", undefined, {
      type: "callout",
      props: { type },
    });
    close();
  };

  const currentMenu = menuRegistry[view]!;

  return (
    <div
      ref={containerRef}
      className="group relative flex items-center gap-2 py-1.5 print:hidden"
    >
      <div className="h-px flex-1 bg-border/25 transition-colors md:bg-border/0 md:group-hover:bg-border" />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Adicionar bloco"
        aria-expanded={open}
        className={cn(
          // On mobile the trigger is always reachable (no hover on touch),
          // but only gets the "chip" (border/background/shadow) when open —
          // by default it's just the "+" glyph, so as not to stack a full
          // circle between every block. From md up, hover already handles
          // discovery, so the chip only appears on hover/focus.
          "z-floating grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground/70 transition-all hover:text-foreground",
          "md:border md:border-border md:bg-card md:text-muted-foreground md:opacity-0 md:shadow-sm md:group-hover:opacity-100 md:focus-visible:opacity-100",
          open &&
            "border border-border bg-card text-foreground shadow-sm md:opacity-100",
        )}
      >
        <Plus
          size={14}
          className={cn("transition-transform", open && "rotate-45")}
        />
      </button>
      <div className="h-px flex-1 bg-border/25 transition-colors md:bg-border/0 md:group-hover:bg-border" />

      <AnimatePresence onExitComplete={resetView}>
        {open && (
          <motion.div
            initial={{ y: 6, scale: 0.95, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="absolute top-full left-1/2 z-20 mt-1 w-max max-w-[90vw] -translate-x-1/2"
          >
            <div className="flex bg-card items-center gap-1 border border-border p-1.5 rounded-2xl shadow-2xl backdrop-blur-xl">
              <AnimatePresence mode="wait">
                <motion.div
                  key={view}
                  initial={{ x: 5, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -5, opacity: 0 }}
                  className="flex items-center gap-1"
                >
                  {currentMenu.parent && (
                    <BackButton onClick={() => setView(currentMenu.parent!)} />
                  )}

                  <div
                    className={
                      currentMenu.buttons.length > 3
                        ? "grid grid-rows-3 md:flex items-center gap-1 "
                        : "flex items-center gap-1"
                    }
                  >
                    {currentMenu.buttons.filter(canAddButton).map((btn) => (
                      <ToolButton
                        key={btn.label}
                        icon={btn.icon}
                        label={btn.label}
                        onClick={() => {
                          if (btn.targetView) setView(btn.targetView);
                          if (btn.onClick) {
                            btn.onClick();
                            close();
                          }
                        }}
                      />
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const ToolButton = ({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center gap-1.5 px-3 py-2 sm:py-1.5 hover:bg-accent hover:text-primary text-muted-foreground rounded-xl transition-all text-[10px] font-bold uppercase tracking-tight"
  >
    {icon} <span>{label}</span>
  </button>
);

const BackButton = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Voltar"
    className="p-2 mr-1 hover:bg-accent rounded-xl text-muted-foreground transition-colors"
  >
    <ChevronLeft size={14} />
  </button>
);

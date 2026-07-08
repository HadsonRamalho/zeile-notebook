"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Box,
  ChevronLeft,
  Cpu,
  Database,
  IdCard,
  Info,
  Loader,
  MoreHorizontal,
  Pencil,
  Plus,
  Terminal,
  Waypoints,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CppIcon } from "@/components/icons/cpp-icon";
import { GithubIcon } from "@/components/icons/github-icon";
import { GoIcon } from "@/components/icons/go-icon";
import { PythonIcon } from "@/components/icons/python-icon";
import { ReactIcon } from "@/components/icons/react-icon";
import { RustIcon } from "@/components/icons/rust-icon";
import { ZigIcon } from "@/components/icons/zig-icon";
import type { BlockMetadata, BlockType, Language } from "@/lib/types";
import { cn } from "@/lib/utils";

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
};

// Divisor sempre presente entre blocos (e no fim da lista) — antes o gatilho
// só existia via hover, o que não funciona em touch e fazia o toque cair no
// bloco por trás (nada estava de fato montado ali até o hover disparar).
// Agora o botão "+" sempre existe no layout (não é absolutamente posicionado
// sobre outro conteúdo) e abre/fecha por clique/toque em ambos os casos —
// hover só aumenta a opacidade no desktop, não é requisito funcional.
export function ReorderTools({ index, addBlock }: ReorderToolsProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<string>("main");
  const containerRef = useRef<HTMLDivElement>(null);

  const resetView = () => setView("main");

  const close = () => {
    setOpen(false);
    resetView();
  };

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
  }, [open]);

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
        },
        {
          label: "Código",
          icon: <Terminal size={14} />,
          targetView: "languages",
        },
        {
          label: "UI",
          icon: <Loader size={14} />,
          targetView: "ui",
        },
        {
          label: "Diagramas",
          icon: <Waypoints size={14} />,
          targetView: "diagrams",
        },
      ],
    },
    diagrams: {
      parent: "main",
      buttons: [
        {
          label: "Desenho",
          icon: <Pencil size={14} />,
          onClick: () => addBlock(index, "free_drawing"),
        },
        {
          label: "Excalidraw",
          icon: <Waypoints size={14} />,
          onClick: () => addBlock(index, "drawing"),
        },
        {
          label: "Database Schema",
          icon: <Database size={14} />,
          onClick: () => addBlock(index, "database_schema"),
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
        },
        {
          label: "React/TS",
          icon: <ReactIcon size={24} />,
          onClick: () => addBlock(index, "code", "typescript"),
        },
        {
          label: "Python",
          icon: <PythonIcon size={24} />,
          onClick: () => addBlock(index, "code", "python"),
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
        },
        {
          label: "C++",
          icon: <CppIcon size={30} />,
          onClick: () => addBlock(index, "code", "cpp"),
        },
        {
          label: "Zig",
          icon: <ZigIcon size={24} />,
          onClick: () => addBlock(index, "code", "zig"),
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

  const currentMenu = menuRegistry[view];

  return (
    <div
      ref={containerRef}
      className="group relative flex items-center gap-2 py-1.5 print:hidden"
    >
      <div className="h-px flex-1 bg-border/0 transition-colors group-hover:bg-border" />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Adicionar bloco"
        aria-expanded={open}
        className={cn(
          // Em mobile não há hover, então o gatilho fica sempre visível
          // (opacity-100); só a partir de md ele se esconde por padrão e
          // aparece no hover/foco — senão o botão fica invisível e
          // inacessível em touch, sem nenhuma forma de abri-lo.
          "z-floating grid size-6 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground opacity-100 shadow-sm transition-all hover:text-foreground md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100",
          open && "md:opacity-100",
        )}
      >
        <Plus
          size={14}
          className={cn("transition-transform", open && "rotate-45")}
        />
      </button>
      <div className="h-px flex-1 bg-border/0 transition-colors group-hover:bg-border" />

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
                    {currentMenu.buttons.map((btn) => (
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

const ToolButton = ({ onClick, icon, label }: any) => (
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

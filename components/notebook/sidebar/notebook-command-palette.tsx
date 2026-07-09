"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import {
  Compass,
  FileText,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  User,
  Users,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DeletePageDialog } from "@/components/delete-page-dialog";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import { useNotebookManager } from "@/components/notebook/notebook-manager";
import { useTeamNotebookManager } from "@/components/notebook/team/team-notebook-manager";
import { cn } from "@/lib/utils";
import type { NotebookMeta } from "@/lib/types";
import type { Team, TeamRole } from "@/lib/types/team-types";

interface NotebookCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: [Team, TeamRole][];
  onRequestCreateTeam: () => void;
}

type FlatItem = {
  key: string;
  onSelect: () => void;
};

export function NotebookCommandPalette({
  open,
  onOpenChange,
  teams,
  onRequestCreateTeam,
}: NotebookCommandPaletteProps) {
  const router = useRouter();
  const { pages, createPage } = useNotebookManager();
  const { teamPages, createTeamPage, deleteTeamPage, refreshTeamPages } =
    useTeamNotebookManager();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const matches = (title: string) =>
    title.toLowerCase().includes(query.trim().toLowerCase());

  const filteredPages = useMemo(
    () => pages.filter((p) => matches(p.title || "Sem título")),
    [pages, query],
  );

  const filteredTeams = useMemo(
    () =>
      teams
        .map(([team]) => ({
          team,
          pages: (teamPages[team.id] ?? []).filter((p) =>
            matches(p.title || "Sem título"),
          ),
        }))
        .filter(({ team, pages: p }) => matches(team.name) || p.length > 0),
    [teams, teamPages, query],
  );

  const globalActions: (FlatItem & { label: string; icon: React.ReactNode })[] = [
    {
      key: "action-new-page",
      label: "Criar novo caderno",
      icon: <Plus className="size-4 shrink-0" />,
      onSelect: () => {
        createPage();
        onOpenChange(false);
      },
    },
    {
      key: "action-new-team",
      label: "Criar novo time",
      icon: <Users className="size-4 shrink-0" />,
      onSelect: () => {
        onRequestCreateTeam();
        onOpenChange(false);
      },
    },
    {
      key: "action-explore",
      label: "Explorar cadernos públicos",
      icon: <Compass className="size-4 shrink-0" />,
      onSelect: () => {
        router.push("/explore");
        onOpenChange(false);
      },
    },
    {
      key: "action-profile",
      label: "Ir para o perfil",
      icon: <User className="size-4 shrink-0" />,
      onSelect: () => {
        router.push("/profile");
        onOpenChange(false);
      },
    },
    {
      key: "action-settings",
      label: "Ir para as configurações",
      icon: <Settings className="size-4 shrink-0" />,
      onSelect: () => {
        router.push("/settings");
        onOpenChange(false);
      },
    },
    {
      key: "action-toggle-theme",
      label:
        resolvedTheme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro",
      icon:
        resolvedTheme === "dark" ? (
          <Sun className="size-4 shrink-0" />
        ) : (
          <Moon className="size-4 shrink-0" />
        ),
      onSelect: () => {
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
        onOpenChange(false);
      },
    },
  ];

  const filteredGlobalActions = globalActions.filter(
    (action) => query.trim() === "" || matches(action.label),
  );

  const flat: FlatItem[] = [...filteredGlobalActions];
  for (const page of filteredPages) {
    flat.push({
      key: `page-${page.id}`,
      onSelect: () => {
        router.push(`/notebook/${page.id}`);
        onOpenChange(false);
      },
    });
  }
  for (const { team, pages: teamPagesFiltered } of filteredTeams) {
    flat.push({
      key: `team-${team.id}`,
      onSelect: () => {
        router.push(`/teams/${team.id}/settings`);
        onOpenChange(false);
      },
    });
    for (const page of teamPagesFiltered) {
      flat.push({
        key: `team-page-${team.id}-${page.id}`,
        onSelect: () => {
          router.push(`/notebook/${page.id}`);
          onOpenChange(false);
        },
      });
    }
  }

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      flat[activeIndex]?.onSelect();
    }
  };

  const rowClass = (key: string) =>
    cn(
      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
      flat[activeIndex]?.key === key
        ? "bg-primary/10 text-primary"
        : "text-foreground hover:bg-accent",
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className="fixed top-[16vh] left-1/2 z-overlay w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-popover/95 shadow-2xl backdrop-blur-lg outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <DialogTitle className="sr-only">
            Buscar ou trocar de caderno
          </DialogTitle>

          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
            <Search className="size-4 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Buscar caderno ou time..."
              aria-label="Buscar caderno ou time"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:block">
              Esc
            </kbd>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {flat.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Nada encontrado.
              </p>
            )}

            {filteredGlobalActions.map((action) => (
              <button
                key={action.key}
                type="button"
                onClick={action.onSelect}
                onMouseEnter={() =>
                  setActiveIndex(flat.findIndex((i) => i.key === action.key))
                }
                className={rowClass(action.key)}
              >
                {action.icon}
                {action.label}
              </button>
            ))}

            {filteredPages.length > 0 && (
              <div className="mt-2 mb-1 px-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Meus cadernos
              </div>
            )}
            {filteredPages.map((page: NotebookMeta) => (
              <div key={page.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    router.push(`/notebook/${page.id}`);
                    onOpenChange(false);
                  }}
                  onMouseEnter={() =>
                    setActiveIndex(
                      flat.findIndex((i) => i.key === `page-${page.id}`),
                    )
                  }
                  className={rowClass(`page-${page.id}`)}
                >
                  <FileText className="size-4 shrink-0" />
                  <span className="truncate">{page.title || "Sem título"}</span>
                </button>
                <DeletePageDialog pageId={page.id} pageTitle={page.title} />
              </div>
            ))}

            {filteredTeams.map(({ team, pages: teamPagesFiltered }) => (
              <div key={team.id}>
                <div className="mt-3 mb-1 flex items-center gap-2 px-3">
                  <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    {team.name}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                  <button
                    type="button"
                    onClick={() => createTeamPage(team.id)}
                    aria-label={`Nova página em ${team.name}`}
                    title={`Nova página em ${team.name}`}
                    className="text-muted-foreground transition-colors hover:text-accent-foreground"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    router.push(`/teams/${team.id}/settings`);
                    onOpenChange(false);
                  }}
                  onMouseEnter={() =>
                    setActiveIndex(
                      flat.findIndex((i) => i.key === `team-${team.id}`),
                    )
                  }
                  className={rowClass(`team-${team.id}`)}
                >
                  <Settings className="size-4 shrink-0" />
                  Configurações do time
                </button>
                {teamPagesFiltered.map((page) => (
                  <div key={page.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        router.push(`/notebook/${page.id}`);
                        onOpenChange(false);
                      }}
                      onMouseEnter={() =>
                        setActiveIndex(
                          flat.findIndex(
                            (i) => i.key === `team-page-${team.id}-${page.id}`,
                          ),
                        )
                      }
                      className={rowClass(`team-page-${team.id}-${page.id}`)}
                    >
                      <FileText className="size-4 shrink-0" />
                      <span className="truncate">
                        {page.title || "Sem título"}
                      </span>
                    </button>
                    <DeletePageDialog
                      pageId={page.id}
                      pageTitle={page.title}
                      teamId={team.id}
                      deleteTeamPage={deleteTeamPage}
                      onDeleteTeamPage={refreshTeamPages}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

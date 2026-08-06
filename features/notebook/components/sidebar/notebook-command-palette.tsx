"use client";

import {
  Compass,
  Download,
  FileText,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  TextSearch,
  User,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeletePageDialog } from "@/features/notebook/components/delete-page-dialog";
import { useNotebookManager } from "@/features/notebook/components/notebook-manager";
import { useTeamNotebookManager } from "@/features/notebook/components/team/team-notebook-manager";
import { buildNotebookHref } from "@/features/notebook/lib/notebook-anchor";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { searchNotebooksRanked } from "@/lib/api/notebook-service";
import { cn } from "@/lib/utils";
import type { NotebookMeta, RankedSearchItem } from "@/types/notebook-types";
import type { Team, TeamRole } from "@/types/team-types";

const HL_START = "‹";
const HL_END = "›";

function renderSnippet(snippet: string): React.ReactNode[] {
  const regex = new RegExp(`${HL_START}(.+?)${HL_END}`, "g");
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match = regex.exec(snippet);
  while (match !== null) {
    if (match.index > last) nodes.push(snippet.slice(last, match.index));
    nodes.push(
      <mark
        key={`hl-${key++}`}
        className="rounded-sm bg-primary/20 px-0.5 text-primary"
      >
        {match[1]}
      </mark>,
    );
    last = match.index + match[0].length;
    match = regex.exec(snippet);
  }
  if (last < snippet.length) nodes.push(snippet.slice(last));
  return nodes;
}

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
  const { canInstall, promptInstall } = useInstallPrompt();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [blockResults, setBlockResults] = useState<RankedSearchItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      setBlockResults([]);
    }
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setBlockResults([]);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const results = await searchNotebooksRanked(term);
        if (!cancelled) {
          setBlockResults(results.filter((r) => r.kind === "block"));
        }
      } catch {
        if (!cancelled) setBlockResults([]);
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  const matches = useCallback(
    (title: string) => title.toLowerCase().includes(query.trim().toLowerCase()),
    [query],
  );

  const filteredPages = useMemo(
    () => pages.filter((p) => matches(p.title || "Sem título")),
    [pages, matches],
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
    [teams, teamPages, matches],
  );

  const globalActions: (FlatItem & { label: string; icon: React.ReactNode })[] =
    [
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
          resolvedTheme === "dark"
            ? "Mudar para tema claro"
            : "Mudar para tema escuro",
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
      ...(canInstall
        ? [
            {
              key: "action-install-app",
              label: "Instalar o Zeile Notebook",
              icon: <Download className="size-4 shrink-0" />,
              onSelect: () => {
                promptInstall();
                onOpenChange(false);
              },
            },
          ]
        : []),
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
  for (const hit of blockResults) {
    flat.push({
      key: `block-${hit.blockId}`,
      onSelect: () => {
        router.push(buildNotebookHref(hit.notebookId, hit.blockId));
        onOpenChange(false);
      },
    });
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: query não é lido no corpo, mas dispara o reset do índice ativo a cada nova busca
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
              placeholder="Buscar cadernos, times e blocos..."
              aria-label="Buscar cadernos, times e blocos"
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

            {blockResults.length > 0 && (
              <div className="mt-3 mb-1 px-3 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Blocos
              </div>
            )}
            {blockResults.map((hit) => (
              <button
                key={`block-${hit.blockId}`}
                type="button"
                onClick={() => {
                  router.push(buildNotebookHref(hit.notebookId, hit.blockId));
                  onOpenChange(false);
                }}
                onMouseEnter={() =>
                  setActiveIndex(
                    flat.findIndex((i) => i.key === `block-${hit.blockId}`),
                  )
                }
                className={cn(
                  rowClass(`block-${hit.blockId}`),
                  "flex-col items-start gap-1",
                )}
              >
                <span className="flex items-center gap-2.5">
                  <TextSearch className="size-4 shrink-0" />
                  <span className="truncate">
                    {hit.notebookTitle || "Sem título"}
                  </span>
                </span>
                {hit.snippet && (
                  <span className="line-clamp-2 pl-[26px] text-left text-xs text-muted-foreground">
                    {renderSnippet(hit.snippet)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}

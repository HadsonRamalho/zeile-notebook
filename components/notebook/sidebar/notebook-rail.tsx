"use client";

import {
  FileText,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Sun,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DeletePageDialog } from "@/components/delete-page-dialog";
import { UserNav } from "@/components/nav/user-nav";
import { CreateTeamDialog } from "@/components/notebook/create-team-dialog";
import { useNotebookManager } from "@/components/notebook/notebook-manager";
import { useTeamNotebookManager } from "@/components/notebook/team/team-notebook-manager";
import { SidebarBackup } from "@/components/sidebar-backup";
import { useThemeToggle } from "@/components/ui/skiper-ui/skiper26";
import { fetchUserTeams } from "@/lib/api/teams-service";
import { cn } from "@/lib/cn";
import type { NotebookMeta } from "@/lib/types";
import type { Team, TeamRole } from "@/lib/types/team-types";
import { NotebookCommandPalette } from "./notebook-command-palette";

const EXPANDED_STORAGE_KEY = "notebook-rail-expanded";

function RailButton({
  onClick,
  href,
  active,
  label,
  expanded,
  children,
}: {
  onClick?: () => void;
  href?: string;
  active?: boolean;
  label: string;
  expanded: boolean;
  children: React.ReactNode;
}) {
  const className = cn(
    "flex shrink-0 items-center rounded-lg text-sm transition-colors",
    expanded
      ? "h-10 w-full gap-2.5 px-2.5"
      : "size-10 justify-center",
    active
      ? "bg-primary/10 text-primary"
      : "text-muted-foreground hover:bg-sidebar-accent hover:text-accent-foreground",
  );

  const content = (
    <>
      {children}
      {expanded && <span className="truncate">{label}</span>}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        title={expanded ? undefined : label}
        aria-label={label}
        className={className}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={expanded ? undefined : label}
      aria-label={label}
      className={className}
    >
      {content}
    </button>
  );
}

function RailThemeToggle({ expanded }: { expanded: boolean }) {
  const { isDark, toggleTheme } = useThemeToggle({
    variant: "circle",
    start: "bottom-left",
  });

  return (
    <RailButton
      expanded={expanded}
      onClick={toggleTheme}
      label={isDark ? "Tema claro" : "Tema escuro"}
    >
      {isDark ? (
        <Sun size={17} className="shrink-0" />
      ) : (
        <Moon size={17} className="shrink-0" />
      )}
    </RailButton>
  );
}

function PageRow({
  page,
  icon,
  active,
  expanded,
  teamId,
  deleteTeamPage,
  onDeleteTeamPage,
}: {
  page: NotebookMeta;
  icon: React.ReactNode;
  active: boolean;
  expanded: boolean;
  teamId?: string;
  deleteTeamPage?: (teamId: string, pageId: string) => Promise<void>;
  onDeleteTeamPage?: (teamId: string) => void;
}) {
  const title = page.title || "Sem título";

  if (!expanded) {
    return (
      <RailButton
        href={`/notebook/${page.id}`}
        active={active}
        label={title}
        expanded={false}
      >
        {icon}
      </RailButton>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full items-center gap-1 rounded-lg",
        active && "bg-primary/10",
      )}
    >
      <Link
        href={`/notebook/${page.id}`}
        className={cn(
          "flex h-10 min-w-0 flex-1 items-center gap-2.5 truncate rounded-lg px-2.5 text-sm transition-colors",
          active
            ? "text-primary"
            : "text-muted-foreground hover:bg-sidebar-accent hover:text-accent-foreground",
        )}
      >
        {icon}
        <span className="truncate">{title}</span>
      </Link>
      <DeletePageDialog
        pageId={page.id}
        pageTitle={page.title}
        teamId={teamId}
        deleteTeamPage={deleteTeamPage}
        onDeleteTeamPage={onDeleteTeamPage}
      />
    </div>
  );
}

export function NotebookRail() {
  const pathname = usePathname();
  const { pages, createPage } = useNotebookManager();
  const { teamPages, createTeamPage, deleteTeamPage, refreshTeamPages } =
    useTeamNotebookManager();
  const [teams, setTeams] = useState<[Team, TeamRole][]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(localStorage.getItem(EXPANDED_STORAGE_KEY) === "1");
  }, []);

  useEffect(() => {
    localStorage.setItem(EXPANDED_STORAGE_KEY, expanded ? "1" : "0");
  }, [expanded]);

  useEffect(() => {
    fetchUserTeams()
      .then((data) => {
        setTeams(data);
        for (const [team] of data) refreshTeamPages(team.id);
      })
      .catch(() => setTeams([]));
  }, [refreshTeamPages]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 flex h-screen shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar/95 py-3 backdrop-blur-lg transition-[width] duration-200 motion-reduce:transition-none",
          expanded ? "w-64 items-stretch px-3" : "w-16",
        )}
      >
        <div
          className={cn(
            "mb-1 flex items-center",
            expanded ? "justify-between px-1" : "w-full justify-center",
          )}
        >
          <Link
            href="/notebook"
            aria-label="Zeile"
            className="flex items-center gap-2"
          >
            <Image src="/logo.png" alt="" width={26} height={26} />
            {expanded && <span className="font-bold">Zeile</span>}
          </Link>
        </div>

        <RailButton
          expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          label={expanded ? "Recolher sidebar" : "Expandir sidebar"}
        >
          {expanded ? (
            <PanelLeftClose size={17} className="shrink-0" />
          ) : (
            <PanelLeftOpen size={17} className="shrink-0" />
          )}
        </RailButton>

        <RailButton
          expanded={expanded}
          onClick={() => setPaletteOpen(true)}
          label="Buscar ou trocar de caderno (⌘K)"
        >
          <Search size={18} className="shrink-0" />
        </RailButton>

        <RailButton expanded={expanded} onClick={() => createPage()} label="Novo caderno">
          <Plus size={18} className="shrink-0" />
        </RailButton>

        <div className={cn(expanded ? "w-full" : "")}>
          <SidebarBackup />
        </div>

        <div
          className={cn(
            "my-2 h-px shrink-0 bg-sidebar-border",
            expanded ? "w-full" : "w-8",
          )}
        />

        <div
          className={cn(
            "flex w-full flex-1 flex-col gap-1 overflow-y-auto",
            expanded ? "items-stretch" : "items-center px-2",
          )}
        >
          {expanded && pages.length > 0 && (
            <span className="px-2.5 pb-1 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Meus cadernos
            </span>
          )}
          {pages.map((page) => (
            <PageRow
              key={page.id}
              page={page}
              icon={<FileText size={17} className="shrink-0" />}
              active={pathname === `/notebook/${page.id}`}
              expanded={expanded}
            />
          ))}

          {teams.map(([team]) => {
            const pagesOfTeam = teamPages[team.id] ?? [];
            if (!expanded) {
              return pagesOfTeam.map((page) => (
                <PageRow
                  key={page.id}
                  page={page}
                  icon={<Users size={17} className="shrink-0" />}
                  active={pathname === `/notebook/${page.id}`}
                  expanded={false}
                />
              ));
            }
            return (
              <div key={team.id} className="mt-3 flex flex-col gap-1">
                <div className="flex items-center gap-2 px-2.5 pb-1">
                  <span className="truncate font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    {team.name}
                  </span>
                  <span className="h-px flex-1 bg-sidebar-border" />
                  <button
                    type="button"
                    onClick={() => createTeamPage(team.id)}
                    aria-label={`Nova página em ${team.name}`}
                    title={`Nova página em ${team.name}`}
                    className="text-muted-foreground transition-colors hover:text-accent-foreground"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                {pagesOfTeam.length === 0 ? (
                  <span className="px-2.5 text-xs italic text-muted-foreground">
                    Sem cadernos
                  </span>
                ) : (
                  pagesOfTeam.map((page) => (
                    <PageRow
                      key={page.id}
                      page={page}
                      icon={<Users size={17} className="shrink-0" />}
                      active={pathname === `/notebook/${page.id}`}
                      expanded
                      teamId={team.id}
                      deleteTeamPage={deleteTeamPage}
                      onDeleteTeamPage={refreshTeamPages}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>

        <div
          className={cn(
            "mt-2 flex w-full flex-col gap-1 border-t border-sidebar-border pt-2",
            expanded ? "items-stretch" : "items-center px-2",
          )}
        >
          <RailThemeToggle expanded={expanded} />
          <div className={cn(expanded ? "w-full" : "")}>
            <UserNav />
          </div>
        </div>
      </aside>

      <NotebookCommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        teams={teams}
        onRequestCreateTeam={() => setCreateTeamOpen(true)}
      />

      <CreateTeamDialog
        open={createTeamOpen}
        onOpenChange={setCreateTeamOpen}
        onCreated={(newTeam) => {
          setTeams((prev) => [...prev, newTeam]);
          refreshTeamPages(newTeam[0].id);
        }}
      />
    </>
  );
}

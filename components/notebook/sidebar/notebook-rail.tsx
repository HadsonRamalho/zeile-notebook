"use client";

import {
  ChevronDown,
  FileText,
  FolderClosed,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Sun,
  Users,
  X,
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
import { useThemeToggle } from "@/components/ui/skiper-ui/skiper26";
import {
  type Folder,
  fetchFolders,
  fetchTeamFolders,
} from "@/lib/api/folders-service";
import { fetchUserTeams } from "@/lib/api/teams-service";
import { readStorage, writeStorage } from "@/lib/safe-storage";
import type { NotebookMeta } from "@/lib/types";
import type { Team, TeamRole } from "@/lib/types/team-types";
import { cn } from "@/lib/utils";
import { NotebookCommandPalette } from "./notebook-command-palette";

const EXPANDED_STORAGE_KEY = "notebook-rail-expanded";
const COLLAPSED_GROUPS_STORAGE_KEY = "notebook-rail-collapsed-groups";
const MY_NOTEBOOKS_GROUP = "my-notebooks";

function RailButton({
  onClick,
  href,
  active,
  label,
  ariaLabel,
  shortcut,
  expanded,
  children,
}: {
  onClick?: () => void;
  href?: string;
  active?: boolean;
  label: string;
  ariaLabel?: string;
  shortcut?: string;
  expanded: boolean;
  children: React.ReactNode;
}) {
  const className = cn(
    "flex shrink-0 items-center rounded-lg text-sm transition-colors",
    expanded ? "h-10 w-full gap-2.5 px-2.5" : "size-10 justify-center",
    active
      ? "bg-primary/10 text-primary"
      : "text-muted-foreground hover:bg-sidebar-accent hover:text-accent-foreground",
  );

  const content = (
    <>
      {children}
      {expanded && <span className="truncate">{label}</span>}
      {expanded && shortcut && (
        <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground/70">
          {shortcut}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        title={expanded ? undefined : label}
        aria-label={ariaLabel ?? label}
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
      aria-label={ariaLabel ?? label}
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
  onNavigate,
}: {
  page: NotebookMeta;
  icon: React.ReactNode;
  active: boolean;
  expanded: boolean;
  teamId?: string | undefined;
  deleteTeamPage?:
    | ((teamId: string, pageId: string) => Promise<void>)
    | undefined;
  onDeleteTeamPage?: ((teamId: string) => void) | undefined;
  onNavigate?: (() => void) | undefined;
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
        {...(onNavigate ? { onClick: onNavigate } : {})}
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

function FolderSubgroup({
  folder,
  pages,
  icon,
  collapsed,
  onToggle,
  pathname,
  onNavigate,
  teamId,
  deleteTeamPage,
  onDeleteTeamPage,
}: {
  folder: Folder;
  pages: NotebookMeta[];
  icon: React.ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  pathname: string;
  onNavigate?: (() => void) | undefined;
  teamId?: string | undefined;
  deleteTeamPage?:
    | ((teamId: string, pageId: string) => Promise<void>)
    | undefined;
  onDeleteTeamPage?: ((teamId: string) => void) | undefined;
}) {
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-accent-foreground"
      >
        <ChevronDown
          size={12}
          className={cn(
            "shrink-0 transition-transform",
            collapsed && "-rotate-90",
          )}
        />
        <FolderClosed size={14} className="shrink-0 text-primary" />
        <span className="truncate">{folder.name}</span>
        <span className="ml-auto font-mono text-[10px] tabular-nums opacity-70">
          {pages.length}
        </span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-1 border-l border-sidebar-border pl-2 ml-3">
          {pages.map((page) => (
            <PageRow
              key={page.id}
              page={page}
              icon={icon}
              active={pathname === `/notebook/${page.id}`}
              expanded
              teamId={teamId}
              deleteTeamPage={deleteTeamPage}
              onDeleteTeamPage={onDeleteTeamPage}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function NotebookRail() {
  const pathname = usePathname();
  const { pages, createPage } = useNotebookManager();
  const { teamPages, createTeamPage, deleteTeamPage, refreshTeamPages } =
    useTeamNotebookManager();
  const [teams, setTeams] = useState<[Team, TeamRole][]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [teamFolders, setTeamFolders] = useState<Record<string, Folder[]>>({});
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    setExpanded(readStorage(EXPANDED_STORAGE_KEY) === "1");
    try {
      const raw = readStorage(COLLAPSED_GROUPS_STORAGE_KEY);
      if (raw) setCollapsedGroups(new Set(JSON.parse(raw) as string[]));
    } catch {}
  }, []);

  useEffect(() => {
    writeStorage(EXPANDED_STORAGE_KEY, expanded ? "1" : "0");
  }, [expanded]);

  useEffect(() => {
    writeStorage(
      COLLAPSED_GROUPS_STORAGE_KEY,
      JSON.stringify([...collapsedGroups]),
    );
  }, [collapsedGroups]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    fetchFolders()
      .then((f) => setFolders(f ?? []))
      .catch(() => setFolders([]));
  }, []);

  useEffect(() => {
    fetchUserTeams()
      .then((data) => {
        setTeams(data);
        for (const [team] of data) {
          refreshTeamPages(team.id);
          fetchTeamFolders(team.id)
            .then((f) =>
              setTeamFolders((prev) => ({ ...prev, [team.id]: f ?? [] })),
            )
            .catch(() => {});
        }
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

  const railBody = (
    isExpanded: boolean,
    onNavigate?: () => void,
    showCollapseToggle = true,
  ) => (
    <>
      <div
        className={cn(
          "mb-1 flex items-center",
          isExpanded ? "justify-between px-1" : "w-full justify-center",
        )}
      >
        <Link
          href="/notebook"
          aria-label="Zeile"
          {...(onNavigate ? { onClick: onNavigate } : {})}
          className="flex items-center gap-2"
        >
          <Image src="/logo.png" alt="" width={26} height={26} />
          {isExpanded && <span className="font-bold">Zeile</span>}
        </Link>
      </div>

      {showCollapseToggle && (
        <RailButton
          expanded={isExpanded}
          onClick={() => setExpanded((v) => !v)}
          label={expanded ? "Recolher sidebar" : "Expandir sidebar"}
        >
          {expanded ? (
            <PanelLeftClose size={17} className="shrink-0" />
          ) : (
            <PanelLeftOpen size={17} className="shrink-0" />
          )}
        </RailButton>
      )}

      <RailButton
        expanded={isExpanded}
        onClick={() => setPaletteOpen(true)}
        label="Buscar"
        ariaLabel="Buscar ou trocar de caderno"
        shortcut="⌘K"
      >
        <Search size={18} className="shrink-0" />
      </RailButton>

      <RailButton
        expanded={isExpanded}
        onClick={() => createPage()}
        label="Novo caderno"
      >
        <Plus size={18} className="shrink-0" />
      </RailButton>

      <div
        className={cn(
          "my-2 h-px shrink-0 bg-sidebar-border",
          isExpanded ? "w-full" : "w-8",
        )}
      />

      <div
        className={cn(
          "flex w-full flex-1 flex-col gap-1 overflow-y-auto",
          isExpanded ? "items-stretch" : "items-center px-2",
        )}
      >
        {isExpanded && pages.length > 0 && (
          <button
            type="button"
            onClick={() => toggleGroup(MY_NOTEBOOKS_GROUP)}
            aria-expanded={!collapsedGroups.has(MY_NOTEBOOKS_GROUP)}
            className="flex items-center gap-1 rounded-md px-2.5 pb-1 pt-0.5 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-accent-foreground"
          >
            <ChevronDown
              size={12}
              className={cn(
                "shrink-0 transition-transform",
                collapsedGroups.has(MY_NOTEBOOKS_GROUP) && "-rotate-90",
              )}
            />
            <span className="truncate">Meus cadernos</span>
          </button>
        )}
        {!isExpanded &&
          pages.map((page) => (
            <PageRow
              key={page.id}
              page={page}
              icon={<FileText size={17} className="shrink-0" />}
              active={pathname === `/notebook/${page.id}`}
              expanded={false}
              onNavigate={onNavigate}
            />
          ))}

        {isExpanded &&
          !collapsedGroups.has(MY_NOTEBOOKS_GROUP) &&
          (() => {
            const ungrouped = pages.filter(
              (p) => !p.folderId || !folders.some((f) => f.id === p.folderId),
            );
            const withPages = folders
              .map((f) => ({
                folder: f,
                items: pages.filter((p) => p.folderId === f.id),
              }))
              .filter((g) => g.items.length > 0);
            return (
              <>
                {ungrouped.map((page) => (
                  <PageRow
                    key={page.id}
                    page={page}
                    icon={<FileText size={17} className="shrink-0" />}
                    active={pathname === `/notebook/${page.id}`}
                    expanded
                    onNavigate={onNavigate}
                  />
                ))}
                {withPages.map(({ folder, items }) => {
                  const key = `folder:${folder.id}`;
                  return (
                    <FolderSubgroup
                      key={folder.id}
                      folder={folder}
                      pages={items}
                      icon={<FileText size={16} className="shrink-0" />}
                      collapsed={collapsedGroups.has(key)}
                      onToggle={() => toggleGroup(key)}
                      pathname={pathname}
                      onNavigate={onNavigate}
                    />
                  );
                })}
              </>
            );
          })()}

        {teams.map(([team]) => {
          const pagesOfTeam = teamPages[team.id] ?? [];
          if (!isExpanded) {
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
          const groupKey = `team:${team.id}`;
          const teamCollapsed = collapsedGroups.has(groupKey);
          return (
            <div key={team.id} className="mt-3 flex flex-col gap-1">
              <div className="flex items-center gap-2 px-2.5 pb-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(groupKey)}
                  aria-expanded={!teamCollapsed}
                  className="flex min-w-0 items-center gap-1 rounded-md font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground transition-colors hover:text-accent-foreground"
                >
                  <ChevronDown
                    size={12}
                    className={cn(
                      "shrink-0 transition-transform",
                      teamCollapsed && "-rotate-90",
                    )}
                  />
                  <span className="truncate">{team.name}</span>
                </button>
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
              {teamCollapsed ? null : pagesOfTeam.length === 0 ? (
                <span className="px-2.5 text-xs italic text-muted-foreground">
                  Sem cadernos
                </span>
              ) : (
                (() => {
                  const teamFolderList = teamFolders[team.id] ?? [];
                  const ungrouped = pagesOfTeam.filter(
                    (p) =>
                      !p.folderId ||
                      !teamFolderList.some((f) => f.id === p.folderId),
                  );
                  const withPages = teamFolderList
                    .map((f) => ({
                      folder: f,
                      items: pagesOfTeam.filter((p) => p.folderId === f.id),
                    }))
                    .filter((g) => g.items.length > 0);
                  return (
                    <>
                      {ungrouped.map((page) => (
                        <PageRow
                          key={page.id}
                          page={page}
                          icon={<Users size={17} className="shrink-0" />}
                          active={pathname === `/notebook/${page.id}`}
                          expanded
                          teamId={team.id}
                          deleteTeamPage={deleteTeamPage}
                          onDeleteTeamPage={refreshTeamPages}
                          onNavigate={onNavigate}
                        />
                      ))}
                      {withPages.map(({ folder, items }) => {
                        const fKey = `team-folder:${team.id}:${folder.id}`;
                        return (
                          <FolderSubgroup
                            key={folder.id}
                            folder={folder}
                            pages={items}
                            icon={<Users size={16} className="shrink-0" />}
                            collapsed={collapsedGroups.has(fKey)}
                            onToggle={() => toggleGroup(fKey)}
                            pathname={pathname}
                            teamId={team.id}
                            deleteTeamPage={deleteTeamPage}
                            onDeleteTeamPage={refreshTeamPages}
                            onNavigate={onNavigate}
                          />
                        );
                      })}
                    </>
                  );
                })()
              )}
            </div>
          );
        })}
      </div>

      <div
        className={cn(
          "mt-2 flex w-full flex-col gap-1 border-t border-sidebar-border pt-2",
          isExpanded ? "items-stretch" : "items-center px-2",
        )}
      >
        <RailThemeToggle expanded={isExpanded} />
        <div className={cn(isExpanded ? "w-full" : "")}>
          <UserNav compact={!isExpanded} />
        </div>
      </div>
    </>
  );

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar/95 py-3 backdrop-blur-lg transition-[width] duration-200 motion-reduce:transition-none md:flex",
          expanded ? "w-64 items-stretch px-3" : "w-16",
        )}
      >
        {railBody(expanded)}
      </aside>

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir navegação"
        className="fixed top-4 left-4 z-30 flex size-11 items-center justify-center rounded-full border border-border bg-card/85 text-foreground shadow-lg backdrop-blur-lg transition-transform active:scale-95 md:hidden"
      >
        <PanelLeftOpen size={20} />
      </button>

      {mobileOpen && (
        <>
          <button
            type="button"
            aria-label="Fechar navegação"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-[45] bg-black/40 md:hidden"
          />
          <div className="fixed inset-y-0 left-0 z-[48] flex w-72 flex-col items-stretch gap-1 bg-sidebar px-3 py-3 shadow-2xl md:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar navegação"
              className="mb-1 flex items-center justify-end px-1 text-muted-foreground transition-colors hover:text-accent-foreground"
            >
              <X size={18} />
            </button>
            {railBody(true, () => setMobileOpen(false), false)}
          </div>
        </>
      )}

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

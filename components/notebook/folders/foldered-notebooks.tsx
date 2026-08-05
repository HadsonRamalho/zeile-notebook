"use client";

import {
  Check,
  FolderClosed,
  FolderPlus,
  MoreVertical,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Folder } from "@/lib/api/folders-service";
import type { NotebookMeta } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TagEditor, TagList } from "../tags/tag-editor";

const DRAG_MIME = "application/x-zeile-notebook";

interface FolderedNotebooksProps {
  notebooks: NotebookMeta[];
  folders: Folder[];
  canManage: boolean;
  onCreateFolder: (name: string) => Promise<void> | void;
  onRenameFolder: (id: string, name: string) => Promise<void> | void;
  onDeleteFolder: (id: string) => Promise<void> | void;
  onMoveNotebook: (
    notebookId: string,
    folderId: string | null,
  ) => Promise<void> | void;
  onSetNotebookTags?: (
    notebookId: string,
    tags: string[],
  ) => Promise<void> | void;
  onSetFolderTags?: (folderId: string, tags: string[]) => Promise<void> | void;
}

function NotebookCard({
  notebook,
  folders,
  canManage,
  onMove,
  onSetTags,
  onDragState,
}: {
  notebook: NotebookMeta;
  folders: Folder[];
  canManage: boolean;
  onMove: (folderId: string | null) => void;
  onSetTags?: (tags: string[]) => Promise<void> | void;
  onDragState?: (dragging: boolean) => void;
}) {
  const tags = notebook.tags ?? [];
  return (
    <div
      className="group relative"
      draggable={canManage}
      onDragStart={(e) => {
        if (!canManage) return;
        e.dataTransfer.setData(DRAG_MIME, notebook.id);
        e.dataTransfer.effectAllowed = "move";
        onDragState?.(true);
      }}
      onDragEnd={() => onDragState?.(false)}
    >
      <Link
        href={`/notebook/${notebook.id}`}
        className={cn(
          "flex h-full flex-col gap-2 rounded-lg border bg-card p-4 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
          canManage && "cursor-grab active:cursor-grabbing",
        )}
      >
        <span className="truncate pr-6 font-medium">
          {notebook.title || "Sem título"}
        </span>
        {tags.length > 0 && <TagList tags={tags} />}
      </Link>
      {canManage && (
        <div className="absolute top-2 right-2 flex items-center opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
          {onSetTags && (
            <TagEditor
              tags={tags}
              onSave={onSetTags}
              triggerClassName="hover:bg-background"
              label="Tags do caderno"
            />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Ações do notebook"
                className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <MoreVertical className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Mover para</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    disabled={!notebook.folderId}
                    onSelect={() => onMove(null)}
                  >
                    Sem pasta
                  </DropdownMenuItem>
                  {folders.length > 0 && <DropdownMenuSeparator />}
                  {folders.map((f) => (
                    <DropdownMenuItem
                      key={f.id}
                      disabled={notebook.folderId === f.id}
                      onSelect={() => onMove(f.id)}
                    >
                      <FolderClosed className="size-4" />
                      {f.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {children}
    </div>
  );
}

function FolderHeader({
  folder,
  count,
  canManage,
  onRename,
  onDelete,
  onSetTags,
}: {
  folder: Folder;
  count: number;
  canManage: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  onSetTags?: (tags: string[]) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(folder.name);

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <FolderClosed className="size-4 shrink-0 text-primary" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (name.trim()) onRename(name.trim());
              setEditing(false);
            } else if (e.key === "Escape") {
              setName(folder.name);
              setEditing(false);
            }
          }}
          // biome-ignore lint/a11y/noAutofocus: foco imediato ao renomear
          autoFocus
          className="h-7 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          type="button"
          aria-label="Salvar"
          onClick={() => {
            if (name.trim()) onRename(name.trim());
            setEditing(false);
          }}
          className="grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"
        >
          <Check className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Cancelar"
          onClick={() => {
            setName(folder.name);
            setEditing(false);
          }}
          className="grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  const folderTags = folder.tags ?? [];

  return (
    <div className="group/fh flex items-center gap-2">
      <FolderClosed className="size-4 shrink-0 text-primary" />
      <h3 className="truncate font-semibold">{folder.name}</h3>
      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
        {count}
      </span>
      {folderTags.length > 0 && <TagList tags={folderTags} />}
      <span className="h-px flex-1 bg-border" />
      {canManage && (
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/fh:opacity-100 [@media(hover:none)]:opacity-100">
          {onSetTags && (
            <TagEditor
              tags={folderTags}
              onSave={onSetTags}
              label="Tags da pasta"
            />
          )}
          <button
            type="button"
            aria-label="Renomear pasta"
            onClick={() => setEditing(true)}
            className="grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Excluir pasta"
            onClick={onDelete}
            className="grid size-6 place-items-center rounded text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function DropZone({
  folderId,
  canManage,
  dragging,
  onDropNotebook,
  className,
  children,
}: {
  folderId: string | null;
  canManage: boolean;
  dragging: boolean;
  onDropNotebook: (notebookId: string, folderId: string | null) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);

  if (!canManage) return <div className={className}>{children}</div>;

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_MIME)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes(DRAG_MIME)) setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        setOver(false);
        const id = e.dataTransfer.getData(DRAG_MIME);
        if (id) onDropNotebook(id, folderId);
      }}
      className={cn(
        "rounded-lg transition-colors",
        dragging && "outline-1 outline-dashed outline-border",
        over && "bg-primary/5 outline-2 outline-primary",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FolderedNotebooks({
  notebooks,
  folders,
  canManage,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveNotebook,
  onSetNotebookTags,
  onSetFolderTags,
}: FolderedNotebooksProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [dragging, setDragging] = useState(false);

  const ungrouped = notebooks.filter(
    (n) => !n.folderId || !folders.some((f) => f.id === n.folderId),
  );

  const submitNew = () => {
    const name = newName.trim();
    if (name) onCreateFolder(name);
    setNewName("");
    setCreating(false);
  };

  return (
    <div className="flex flex-col gap-6">
      {canManage && (
        <div>
          {creating ? (
            <div className="flex items-center gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitNew();
                  } else if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                  }
                }}
                placeholder="Nome da pasta"
                // biome-ignore lint/a11y/noAutofocus: foco imediato ao criar
                autoFocus
                className="h-8 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={submitNew}
                className="rounded-md bg-primary px-2.5 py-1 text-sm text-primary-foreground"
              >
                Criar
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <FolderPlus className="size-4" />
              Nova pasta
            </button>
          )}
        </div>
      )}

      {(ungrouped.length > 0 ||
        (canManage && dragging && folders.length > 0)) && (
        <DropZone
          folderId={null}
          canManage={canManage}
          dragging={dragging && folders.length > 0}
          onDropNotebook={onMoveNotebook}
          className="p-1"
        >
          {ungrouped.length > 0 ? (
            <Grid>
              {ungrouped.map((n) => (
                <NotebookCard
                  key={n.id}
                  notebook={n}
                  folders={folders}
                  canManage={canManage}
                  onMove={(fid) => onMoveNotebook(n.id, fid)}
                  onSetTags={
                    onSetNotebookTags
                      ? (tags) => onSetNotebookTags(n.id, tags)
                      : undefined
                  }
                  onDragState={setDragging}
                />
              ))}
            </Grid>
          ) : (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">
              Solte aqui para remover da pasta
            </p>
          )}
        </DropZone>
      )}

      {folders.map((folder) => {
        const inFolder = notebooks.filter((n) => n.folderId === folder.id);
        return (
          <section key={folder.id} className="flex flex-col gap-3">
            <FolderHeader
              folder={folder}
              count={inFolder.length}
              canManage={canManage}
              onRename={(name) => onRenameFolder(folder.id, name)}
              onDelete={() => onDeleteFolder(folder.id)}
              onSetTags={
                onSetFolderTags
                  ? (tags) => onSetFolderTags(folder.id, tags)
                  : undefined
              }
            />
            <DropZone
              folderId={folder.id}
              canManage={canManage}
              dragging={dragging}
              onDropNotebook={onMoveNotebook}
              className="p-1"
            >
              {inFolder.length === 0 ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">
                  {dragging ? "Solte aqui para mover" : "Pasta vazia."}
                </p>
              ) : (
                <Grid>
                  {inFolder.map((n) => (
                    <NotebookCard
                      key={n.id}
                      notebook={n}
                      folders={folders}
                      canManage={canManage}
                      onMove={(fid) => onMoveNotebook(n.id, fid)}
                      onSetTags={
                        onSetNotebookTags
                          ? (tags) => onSetNotebookTags(n.id, tags)
                          : undefined
                      }
                      onDragState={setDragging}
                    />
                  ))}
                </Grid>
              )}
            </DropZone>
          </section>
        );
      })}
    </div>
  );
}

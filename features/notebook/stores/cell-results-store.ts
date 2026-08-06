"use client";

import { useSyncExternalStore } from "react";

export type CellValue = string | number | boolean | null;

export interface TableResult {
  columns: string[];
  rows: CellValue[][];
  updatedAt: number;
}

const store = new Map<string, TableResult>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishCellResult(
  blockId: string,
  result: Omit<TableResult, "updatedAt">,
) {
  store.set(blockId, { ...result, updatedAt: Date.now() });
  emit();
}

export function clearCellResult(blockId: string) {
  if (store.delete(blockId)) emit();
}

export function useCellResult(blockId: string | undefined): TableResult | null {
  return useSyncExternalStore(
    subscribe,
    () => (blockId ? (store.get(blockId) ?? null) : null),
    () => null,
  );
}

export function tableFromRecords(data: unknown): TableResult | null {
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object") {
    const columns = Array.from(
      data.reduce<Set<string>>((set, row) => {
        if (row && typeof row === "object") {
          for (const key of Object.keys(row)) set.add(key);
        }
        return set;
      }, new Set<string>()),
    );
    const rows = data.map((row) =>
      columns.map((col) => {
        const value = (row as Record<string, unknown>)[col];
        return (value ?? null) as CellValue;
      }),
    );
    return { columns, rows, updatedAt: Date.now() };
  }

  if (
    data &&
    typeof data === "object" &&
    Array.isArray((data as { columns?: unknown }).columns) &&
    Array.isArray((data as { rows?: unknown }).rows)
  ) {
    const typed = data as { columns: string[]; rows: CellValue[][] };
    return { columns: typed.columns, rows: typed.rows, updatedAt: Date.now() };
  }

  return null;
}

export function parseInlineTable(content: string): TableResult | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  try {
    return tableFromRecords(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

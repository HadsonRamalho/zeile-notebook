import type { Database, SqlJsStatic } from "sql.js";

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

export async function getSqlJs(): Promise<SqlJsStatic> {
  if (typeof window === "undefined") {
    throw new Error("sql.js can only be loaded in the browser.");
  }

  if (!sqlJsPromise) {
    sqlJsPromise = import("sql.js").then((mod) =>
      mod.default({
        locateFile: () => "https://sql.js.org/dist/sql-wasm.wasm",
      }),
    );
  }

  return sqlJsPromise;
}

const databasesByNotebook = new Map<string, Database>();

export async function getNotebookDatabase(
  notebookId: string,
): Promise<Database> {
  const existing = databasesByNotebook.get(notebookId);
  if (existing) return existing;

  const SQL = await getSqlJs();
  const db = new SQL.Database();
  databasesByNotebook.set(notebookId, db);
  return db;
}

export function resetNotebookDatabase(notebookId: string): void {
  const existing = databasesByNotebook.get(notebookId);
  if (existing) {
    existing.close();
    databasesByNotebook.delete(notebookId);
  }
}

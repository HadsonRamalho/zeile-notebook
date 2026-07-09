"use client";

import { sql } from "@codemirror/lang-sql";
import { EditorView } from "@codemirror/view";
import { vscodeDark, vscodeLight } from "@uiw/codemirror-theme-vscode";
import CodeMirror from "@uiw/react-codemirror";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsTouchDevice } from "@/hooks/use-is-touch-device";
import { useLocalStorage } from "@/hooks/use-local-storate";
import { getNotebookDatabase } from "@/lib/sqlDbStore";
import { RunButton } from "../default/run-button";

export const defaultSqlContent =
  "create table if not exists people (id integer primary key, name text);\ninsert into people (name) values ('Ada Lovelace');\nselect * from people;";

interface QueryExecResult {
  columns: string[];
  values: unknown[][];
}

interface SqlCellProps {
  content: string;
  onChange: (content: string) => void;
  canWrite: boolean;
  notebookId: string;
}

export function SqlCell({
  content,
  onChange,
  canWrite,
  notebookId,
}: SqlCellProps) {
  const { resolvedTheme } = useTheme();
  const isTouchDevice = useIsTouchDevice();
  const [fontSize] = useLocalStorage<number>("editor-font-size", 14);
  const localContentRef = useRef(content);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<QueryExecResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getNotebookDatabase(notebookId).then(() => {
      if (!cancelled) setDbReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [notebookId]);

  const extensions = useMemo(
    () => [
      sql(),
      EditorView.lineWrapping,
      EditorView.theme({ "&": { fontSize: `${fontSize}px` } }),
    ],
    [fontSize],
  );

  const handleChange = useCallback(
    (val: string) => {
      localContentRef.current = val;
      onChange(val);
    },
    [onChange],
  );

  const handleRun = useCallback(async () => {
    setIsRunning(true);
    setError(null);
    try {
      const db = await getNotebookDatabase(notebookId);
      const execResults = db.exec(localContentRef.current);
      setResults(execResults);
    } catch (err) {
      setResults(null);
      setError(err instanceof Error ? err.message : "Erro ao executar SQL");
    } finally {
      setIsRunning(false);
    }
  }, [notebookId]);

  return (
    <div className="w-full overflow-hidden rounded-lg border bg-card">
      <div
        style={{
          height: 200,
          minHeight: 200,
          maxHeight: 400,
          resize: "vertical",
          overflow: "auto",
        }}
        className="border-b border-border"
      >
        <CodeMirror
          value={localContentRef.current}
          height="100%"
          theme={resolvedTheme === "dark" ? vscodeDark : vscodeLight}
          extensions={extensions}
          autoFocus={!isTouchDevice}
          onChange={handleChange}
          editable={canWrite}
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLine: false,
            indentOnInput: true,
            autocompletion: true,
            tabSize: 2,
          }}
          className="text-sm w-full h-full overflow-auto"
        />
      </div>

      <div className="flex items-center justify-between gap-2 p-2">
        <span className="text-xs text-muted-foreground">
          Banco compartilhado por este caderno
        </span>
        <RunButton
          isRunning={isRunning}
          isLoading={!dbReady}
          handleRun={handleRun}
        />
      </div>

      {error && (
        <p className="border-t border-border px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {results && results.length === 0 && !error && (
        <p className="border-t border-border px-3 py-2 text-sm text-muted-foreground">
          Comando executado, sem resultados para exibir.
        </p>
      )}

      {results?.map((result, resultIndex) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: resultados não têm identidade estável entre execuções
          key={resultIndex}
          className="overflow-x-auto border-t border-border"
        >
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-muted/50">
                {result.columns.map((column) => (
                  <th
                    key={column}
                    className="whitespace-nowrap px-3 py-2 font-medium text-muted-foreground"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.values.map((row, rowIndex) => (
                <tr
                  // biome-ignore lint/suspicious/noArrayIndexKey: linhas não têm identidade estável entre execuções
                  key={rowIndex}
                  className="border-t border-border"
                >
                  {row.map((cell, cellIndex) => (
                    <td
                      // biome-ignore lint/suspicious/noArrayIndexKey: células não têm identidade estável entre execuções
                      key={cellIndex}
                      className="whitespace-nowrap px-3 py-1.5"
                    >
                      {cell === null ? (
                        <span className="text-muted-foreground italic">
                          null
                        </span>
                      ) : (
                        String(cell)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

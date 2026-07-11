"use client";

import type { EditorView } from "@codemirror/view";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
} from "lucide-react";
import { cn } from "@/lib/cn";

function wrapSelection(view: EditorView, mark: string, placeholder: string) {
  const { state } = view;
  const changes = [];
  for (const range of state.selection.ranges) {
    const selected = state.sliceDoc(range.from, range.to) || placeholder;
    changes.push({
      from: range.from,
      to: range.to,
      insert: `${mark}${selected}${mark}`,
    });
  }
  view.dispatch({ changes });
  view.focus();
}

function prefixLines(
  view: EditorView,
  makePrefix: (indexInSelection: number) => string,
) {
  const { state } = view;
  const changes = [];
  const seen = new Set<number>();
  let counter = 0;
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let n = startLine; n <= endLine; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const line = state.doc.line(n);
      changes.push({ from: line.from, insert: makePrefix(counter) });
      counter++;
    }
  }
  view.dispatch({ changes });
  view.focus();
}

function insertLink(view: EditorView) {
  const { state } = view;
  const changes = [];
  for (const range of state.selection.ranges) {
    const selected = state.sliceDoc(range.from, range.to) || "texto";
    changes.push({
      from: range.from,
      to: range.to,
      insert: `[${selected}](url)`,
    });
  }
  view.dispatch({ changes });
  view.focus();
}

type ToolbarAction = {
  label: string;
  icon: React.ReactNode;
  run: (view: EditorView) => void;
};

const ACTIONS: (ToolbarAction | "divider")[] = [
  {
    label: "Negrito",
    icon: <Bold size={15} />,
    run: (v) => wrapSelection(v, "**", "negrito"),
  },
  {
    label: "Itálico",
    icon: <Italic size={15} />,
    run: (v) => wrapSelection(v, "*", "itálico"),
  },
  {
    label: "Tachado",
    icon: <Strikethrough size={15} />,
    run: (v) => wrapSelection(v, "~~", "tachado"),
  },
  {
    label: "Código",
    icon: <Code size={15} />,
    run: (v) => wrapSelection(v, "`", "código"),
  },
  "divider",
  {
    label: "Título 1",
    icon: <Heading1 size={15} />,
    run: (v) => prefixLines(v, () => "# "),
  },
  {
    label: "Título 2",
    icon: <Heading2 size={15} />,
    run: (v) => prefixLines(v, () => "## "),
  },
  {
    label: "Título 3",
    icon: <Heading3 size={15} />,
    run: (v) => prefixLines(v, () => "### "),
  },
  "divider",
  {
    label: "Lista",
    icon: <List size={15} />,
    run: (v) => prefixLines(v, () => "- "),
  },
  {
    label: "Lista numerada",
    icon: <ListOrdered size={15} />,
    run: (v) => prefixLines(v, (i) => `${i + 1}. `),
  },
  {
    label: "Citação",
    icon: <Quote size={15} />,
    run: (v) => prefixLines(v, () => "> "),
  },
  {
    label: "Link",
    icon: <LinkIcon size={15} />,
    run: insertLink,
  },
];

export function MarkdownToolbar({
  getView,
  className,
}: {
  getView: () => EditorView | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-card/80 p-1 backdrop-blur",
        className,
      )}
    >
      {ACTIONS.map((action, i) => {
        if (action === "divider") {
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: divisores estáticos
              key={`divider-${i}`}
              className="mx-0.5 h-5 w-px bg-border"
            />
          );
        }
        return (
          <button
            key={action.label}
            type="button"
            aria-label={action.label}
            title={action.label}
            onMouseDown={(e) => {
              e.preventDefault();
              const view = getView();
              if (view) action.run(view);
            }}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {action.icon}
          </button>
        );
      })}
    </div>
  );
}

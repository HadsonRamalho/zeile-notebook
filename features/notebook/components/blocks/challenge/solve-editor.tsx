"use client";

import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { rust } from "@codemirror/lang-rust";
import { EditorView } from "@codemirror/view";
import { vscodeDark, vscodeLight } from "@uiw/codemirror-theme-vscode";
import CodeMirror, { type Extension } from "@uiw/react-codemirror";
import { zig } from "codemirror-lang-zig";
import { useTheme } from "next-themes";
import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { languageLabel } from "@/domain/challenges/display";
import type { Language } from "@/types/block-types";

function languageExtension(language: Language): Extension {
  switch (language) {
    case "go":
      return go();
    case "cpp":
      return cpp();
    case "zig":
      return zig();
    default:
      return rust();
  }
}

export function SolveEditor({
  value,
  onChange,
  language,
  languages,
  onLanguageChange,
  readOnly = false,
}: {
  value: string;
  onChange: (value: string) => void;
  language: Language;
  languages: Language[];
  onLanguageChange: (language: Language) => void;
  readOnly?: boolean;
}) {
  const { resolvedTheme } = useTheme();

  const extensions = useMemo(
    () => [
      languageExtension(language),
      EditorView.lineWrapping,
      EditorView.theme({ "&": { fontSize: "13px" } }),
    ],
    [language],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-1.5">
        <span className="font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
          {languageLabel(language)}
        </span>
        <Select
          value={language}
          onValueChange={(v) => onLanguageChange(v as Language)}
          disabled={readOnly || languages.length <= 1}
        >
          <SelectTrigger
            size="sm"
            className="h-7 border-none bg-transparent px-2 font-mono text-[10px] font-bold uppercase tracking-wide shadow-none hover:bg-muted/60"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map((l) => (
              <SelectItem key={l} value={l}>
                {languageLabel(l)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <CodeMirror
          value={value}
          onChange={onChange}
          theme={resolvedTheme === "dark" ? vscodeDark : vscodeLight}
          extensions={extensions}
          editable={!readOnly}
          height="100%"
          minHeight="320px"
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLine: !readOnly,
            autocompletion: true,
            tabSize: 4,
          }}
          className="h-full text-sm"
        />
      </div>
    </div>
  );
}

"use client";

import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { EditorView } from "@codemirror/view";
import { vscodeDark, vscodeLight } from "@uiw/codemirror-theme-vscode";
import CodeMirror, {
  type Extension,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror";
import diff from "fast-diff";
import { useTheme } from "next-themes";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type { BlockType, Language } from "@/lib/types";

interface BlockEditorProps {
  content: string;
  type: BlockType;
  language?: Language;
  onBlur: () => void;
  onChange: (val: string) => void;
  onLanguageChange?: (lang: Language) => void;
  readOnly?: boolean;
  className?: string;
  minHeight?: string;
}

export const GenericBlockEditor = React.memo(
  ({
    content,
    onBlur,
    type,
    language = "typescript",
    onChange,
    onLanguageChange,
    readOnly = false,
    className = "",
    minHeight = "40px",
  }: BlockEditorProps) => {
    const { resolvedTheme } = useTheme();
    const editorRef = useRef<ReactCodeMirrorRef>(null);
    const localContentRef = useRef(content);

    const languageExtension = useMemo(() => {
      switch (language) {
        case "rust":
          return rust();
        case "typescript":
          return javascript({ typescript: true, jsx: true });
        case "javascript" as Language:
          return javascript({ jsx: true });
        case "python":
          return python();
        case "go":
          return go();
        case "cpp":
          return cpp();
        default:
          return javascript({ typescript: true, jsx: true });
      }
    }, [language]);

    const extensions = useMemo(() => {
      return [languageExtension, EditorView.lineWrapping] as Extension[];
    }, [languageExtension]);

    const basicSetup = useMemo(
      () => ({
        lineNumbers: type !== "text",
        foldGutter: false,
        highlightActiveLine: false,
        indentOnInput: true,
        autocompletion: true,
        tabSize: 4,
      }),
      [type],
    );

    const handleChange = useCallback(
      (val: string) => {
        localContentRef.current = val;
        onChange(val);
      },
      [onChange],
    );

    const handleLanguageChange = useCallback(
      (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newLang = e.target.value as Language;
        if (onLanguageChange) {
          onLanguageChange(newLang);
        }
      },
      [onLanguageChange],
    );

    useEffect(() => {
      const view = editorRef.current?.view;
      if (!view) return;

      const currentText = view.state.doc.toString();

      if (currentText === content) return;

      const diffs = diff(currentText, content);

      let cursorOffset = 0;
      const changes = [];

      for (const [diffType, text] of diffs) {
        if (diffType === 0) {
          cursorOffset += text.length;
        } else if (diffType === -1) {
          changes.push({
            from: cursorOffset,
            to: cursorOffset + text.length,
            insert: "",
          });
        } else if (diffType === 1) {
          changes.push({
            from: cursorOffset,
            to: cursorOffset,
            insert: text,
          });
        }
      }

      view.dispatch({
        changes: changes,
      });

      localContentRef.current = content;
    }, [content]);

    return (
      <div
        className={`flex flex-col w-full border border-border rounded-md overflow-hidden ${className}`}
      >
        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b border-border">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {language}
          </span>
          <select
            value={language}
            onChange={handleLanguageChange}
            disabled={readOnly}
            className="bg-transparent text-xs text-muted-foreground outline-none cursor-pointer hover:text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="typescript">TypeScript</option>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="rust">Rust</option>
            <option value="go">Go</option>
            <option value="cpp">C++</option>
          </select>
        </div>
        <CodeMirror
          ref={editorRef}
          value={localContentRef.current}
          height="auto"
          minHeight={minHeight}
          theme={resolvedTheme === "dark" ? vscodeDark : vscodeLight}
          extensions={extensions}
          onBlur={onBlur}
          autoFocus={true}
          onChange={handleChange}
          editable={!readOnly}
          basicSetup={basicSetup}
          className="text-sm w-full outline-none"
        />
      </div>
    );
  },
);

GenericBlockEditor.displayName = "BlockEditor";

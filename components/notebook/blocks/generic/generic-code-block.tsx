"use client";

import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { zig } from "codemirror-lang-zig";
import { EditorView } from "@codemirror/view";
import { vscodeDark, vscodeLight } from "@uiw/codemirror-theme-vscode";
import CodeMirror, {
  type Extension,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror";
import diff from "fast-diff";
import { useTheme } from "next-themes";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/motion/select";
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
        case "zig":
          return zig();
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
      (newLang: string) => {
        if (onLanguageChange) {
          onLanguageChange(newLang as Language);
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
          <Select
            value={language}
            onValueChange={handleLanguageChange}
            disabled={readOnly}
          >
            <SelectTrigger className="h-6 text-[10px] uppercase font-bold tracking-tight border-none shadow-none bg-transparent hover:bg-muted/50 p-1">

              <SelectValue placeholder="Language" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="typescript">TypeScript</SelectItem>
              <SelectItem value="javascript">JavaScript</SelectItem>
              <SelectItem value="python">Python</SelectItem>
              <SelectItem value="rust">Rust</SelectItem>
              <SelectItem value="go">Go</SelectItem>
              <SelectItem value="cpp">C++</SelectItem>
              <SelectItem value="zig">Zig</SelectItem>
            </SelectContent>
          </Select>
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

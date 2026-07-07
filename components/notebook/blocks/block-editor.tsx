"use client";

import { cpp } from "@codemirror/lang-cpp";
import { go } from "@codemirror/lang-go";
import { javascript } from "@codemirror/lang-javascript";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
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
import type { BlockType, Language } from "@/lib/types";

interface BlockEditorProps {
  content: string;
  type: BlockType;
  language?: Language;
  onBlur: () => void;
  onChange: (val: string) => void;
  readOnly?: boolean;
  className?: string;
  minHeight?: string;
}

export const BlockEditor = React.memo(
  ({
    content,
    onBlur,
    type,
    language,
    onChange,
    readOnly = false,
    className,
    minHeight = "40px",
  }: BlockEditorProps) => {
    const { resolvedTheme } = useTheme();
    const editorRef = useRef<ReactCodeMirrorRef>(null);

    const localContentRef = useRef(content);

    const languageExtension = useMemo(() => {
      if (type === "text") {
        return markdown({ base: markdownLanguage });
      }

      if (type === "component") {
        return javascript({ typescript: true, jsx: true });
      }

      switch (language) {
        case "rust":
          return rust();
        case "typescript":
          return javascript({ typescript: true, jsx: true });
        case "python":
          return python();
        case "go":
          return go();
        case "cpp":
          return cpp();
        case "zig":
          return zig();
        default:
          return [];
      }
    }, [language, type]);

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

    useEffect(() => {
      const view = editorRef.current?.view;
      if (!view) return;

      const currentText = view.state.doc.toString();

      if (currentText === content) return;

      const diffs = diff(currentText, content);

      let cursorOffset = 0;
      const changes = [];

      for (const [type, text] of diffs) {
        if (type === 0) {
          cursorOffset += text.length;
        } else if (type === -1) {
          changes.push({
            from: cursorOffset,
            to: cursorOffset + text.length,
            insert: "",
          });
        } else if (type === 1) {
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

    if (type === "code" || type === "component") {
      const defaultHeight = 240;
      return (
        <div
          style={{
            height: defaultHeight,
            minHeight: defaultHeight,
            maxHeight: defaultHeight * 2,
            resize: "vertical",
            overflow: "auto",
          }}
          className={`rounded-md border border-border ${className}`}
        >
          <CodeMirror
            ref={editorRef}
            value={localContentRef.current}
            height="100%"
            theme={resolvedTheme === "dark" ? vscodeDark : vscodeLight}
            extensions={extensions}
            onBlur={onBlur}
            autoFocus={true}
            onChange={handleChange}
            editable={!readOnly}
            basicSetup={basicSetup}
            className="text-sm w-full h-full overflow-auto"
          />
        </div>
      );
    }

    return (
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
        className={`text-sm w-full border border-border rounded-md overflow-hidden ${className}`}
      />
    );
  },
);

BlockEditor.displayName = "BlockEditor";

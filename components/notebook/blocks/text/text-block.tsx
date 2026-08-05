"use client";
import type { EditorView } from "@codemirror/view";
import { useRef, useState } from "react";
import Markdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { BlockEditor } from "../block-editor";
import { MarkdownToolbar } from "./markdown-toolbar";

interface TextBlockProps {
  content: string;
  onChange: (v: string) => void;
}

export function TextBlock({ content, onChange }: TextBlockProps) {
  const [isEditing, setIsEditing] = useState(false);
  const viewRef = useRef<EditorView | null>(null);

  if (isEditing) {
    return (
      <div className="flex flex-col gap-1.5">
        <MarkdownToolbar getView={() => viewRef.current} />
        <BlockEditor
          className="w-full bg-muted text-foreground text-lg outline-none resize-none py-2"
          content={content}
          onBlur={() => {
            setIsEditing(false);
          }}
          onChange={(e) => onChange(e)}
          onCreateEditor={(view) => {
            viewRef.current = view;
          }}
          minHeight="60px"
          type="text"
        />
      </div>
    );
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: não pode ser um button real, o markdown renderizado dentro pode conter links e outros elementos interativos aninhados
    <div
      data-edit-trigger
      role="button"
      tabIndex={0}
      onClick={() => setIsEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsEditing(true);
        }
      }}
      className="prose dark:prose-invert max-w-none cursor-text hover:bg-accent/50 p-2 rounded-lg transition-colors whitespace-pre-wrap leading-snug prose-p:my-0 prose-p:leading-normal prose-headings:mt-3 prose-headings:mb-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-code:before:content-none prose-code:after:content-none prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-sm prose-code:font-normal prose-code:text-foreground"
    >
      {content ? (
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
          {content}
        </Markdown>
      ) : (
        <span className="text-muted-foreground italic">
          Clique para escrever...
        </span>
      )}
    </div>
  );
}

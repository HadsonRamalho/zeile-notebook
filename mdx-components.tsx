import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import type { AnchorHTMLAttributes, ComponentProps } from "react";
import Slugger from "github-slugger";
import { codeToHtml } from "shiki";
import { Banner } from "@/components/banner";
import { GithubRepoMDX } from "@/components/github-info-mdx";
import { Callout } from "@/components/mdx/callout";
import { Card, Cards } from "@/components/mdx/card";
import { RustEditorMDX } from "@/components/notebook/blocks/rust/rust-editor-mdx";
import { TsxEditorMDX } from "@/components/notebook/blocks/tsx/tsx-editor-mdx";
import { PythonEditorMDX } from "@/components/notebook/blocks/python/python-editor-mdx";

function heading(Tag: `h${1 | 2 | 3 | 4 | 5 | 6}`, slugger: Slugger) {
  return function Heading({ children, ...props }: ComponentProps<typeof Tag>) {
    const text = typeof children === "string" ? children : "";
    const id = text ? slugger.slug(text) : undefined;
    return (
      <Tag id={id} {...props}>
        {children}
      </Tag>
    );
  };
}

function A({ href = "", ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  if (href.startsWith("/") || href.startsWith("#")) {
    return <Link href={href} {...props} />;
  }
  return <a href={href} target="_blank" rel="noreferrer" {...props} />;
}

function Pre({ children }: ComponentProps<"pre">) {
  const code = (children as { props?: { children?: string; className?: string } })?.props;
  const raw = typeof code?.children === "string" ? code.children : "";
  const lang = code?.className?.replace("language-", "") || "text";

  return <CodeBlock code={raw} lang={lang} />;
}

async function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const html = await codeToHtml(code, {
    lang,
    theme: "github-dark",
  }).catch(() => `<pre><code>${code}</code></pre>`);

  // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output is trusted, generated at build time
  return <div className="not-prose" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  const slugger = new Slugger();

  return {
    h1: heading("h1", slugger),
    h2: heading("h2", slugger),
    h3: heading("h3", slugger),
    h4: heading("h4", slugger),
    h5: heading("h5", slugger),
    h6: heading("h6", slugger),
    a: A,
    pre: Pre,
    img: (props: ComponentProps<"img">) => (
      // biome-ignore lint/a11y/useAltText: alt is spread from props
      <img {...props} />
    ),
    Callout,
    Card,
    Cards,
    Banner,
    GithubRepoMDX,
    RustEditorMDX,
    TsxEditorMDX,
    PythonEditorMDX,
    ...components,
  };
}

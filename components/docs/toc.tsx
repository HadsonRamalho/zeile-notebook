"use client";

import {
  type AnchorHTMLAttributes,
  createContext,
  type ReactNode,
  use,
  useEffect,
  useRef,
  useState,
} from "react";
import type { TOCItemType } from "@/lib/utils";

const ActiveAnchorContext = createContext<string[]>([]);

export function useActiveAnchors(): string[] {
  return use(ActiveAnchorContext);
}

export function useActiveAnchor(): string | undefined {
  return useActiveAnchors()[0];
}

export function AnchorProvider({
  toc,
  children,
}: {
  toc: TOCItemType[];
  children: ReactNode;
}) {
  const [active, setActive] = useState<string[]>([]);

  useEffect(() => {
    const ids = toc.map((item) => item.url.slice(1));
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const visible = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }

        if (visible.size > 0) {
          setActive(ids.filter((id) => visible.has(id)));
        }
      },
      { rootMargin: "-80px 0% -70% 0%" },
    );

    elements.forEach((el) => {
      observer.observe(el);
    });
    return () => observer.disconnect();
  }, [toc]);

  return <ActiveAnchorContext value={active}>{children}</ActiveAnchorContext>;
}

export function TOCItem({
  href,
  ref,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  ref?: React.Ref<HTMLAnchorElement>;
}) {
  const active = useActiveAnchors();
  const isActive = active.includes((href ?? "").slice(1));

  return (
    <a
      ref={ref}
      href={href}
      data-active={isActive}
      onClick={(e) => {
        if (!href) return;
        const el = document.getElementById(href.slice(1));
        if (el) {
          e.preventDefault();
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          history.replaceState(null, "", href);
        }
      }}
      {...props}
    />
  );
}

export function useTocScrollIntoView(
  containerRef: React.RefObject<HTMLElement | null>,
) {
  const active = useActiveAnchors();
  const prev = useRef<string | undefined>(undefined);

  useEffect(() => {
    const current = active[0];
    if (!current || current === prev.current || !containerRef.current) return;
    prev.current = current;

    const el = containerRef.current.querySelector<HTMLElement>(
      `a[href="#${current}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [active, containerRef]);
}

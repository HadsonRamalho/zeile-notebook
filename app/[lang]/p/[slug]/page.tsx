import type { Metadata } from "next";
import { PublicNotebookView } from "@/features/notebook/components/public/public-notebook-view";

async function fetchPublicMeta(slug: string) {
  const base = process.env.NEXT_PUBLIC_API || "http://localhost:3099/api";
  try {
    const res = await fetch(`${base}/notebook/public/${slug}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as { title: string; ownerName: string | null };
  } catch {
    return null;
  }
}

export async function generateMetadata(
  props: PageProps<"/[lang]/p/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const meta = await fetchPublicMeta(slug);
  if (!meta) {
    return { title: "Caderno público — Zeile Notebook" };
  }
  const description = meta.ownerName
    ? `Caderno de ${meta.ownerName} no Zeile Notebook`
    : "Caderno público no Zeile Notebook";
  return {
    title: `${meta.title} — Zeile Notebook`,
    description,
    openGraph: {
      title: meta.title,
      description,
      type: "article",
    },
  };
}

export default async function PublicNotebookPage(
  props: PageProps<"/[lang]/p/[slug]">,
) {
  const { slug } = await props.params;
  return <PublicNotebookView slug={slug} />;
}

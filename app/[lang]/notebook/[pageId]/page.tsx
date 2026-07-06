import type { Metadata } from "next";
import { NotebookProvider } from "@/components/notebook/notebook-context";
import { NotebookControls } from "@/components/notebook/notebook-controls";
import RustInteractivePage from "@/components/notebook/notebook-page";
import { NotebookTitle } from "@/components/notebook/notebook-title";

export default async function Page(
  props: PageProps<"/[lang]/notebook/[pageId]">,
) {
  const { pageId } = await props.params;

  return (
    <NotebookProvider pageId={pageId}>
      <div className="flex flex-col mb-8 max-w-none!">
        <NotebookTitle pageId={pageId} />
        <p className="text-muted-foreground text-xs mt-1 font-mono">
          ID: {pageId}
        </p>
        <div className="mt-2 md:w-330">
          <NotebookControls />
        </div>
      </div>

      <div className="prose flex-1">
        <RustInteractivePage pageId={pageId} />
      </div>
    </NotebookProvider>
  );
}

export function generateMetadata(): Metadata {
  return {
    title: "Zeile Notebook",
    description: "Caderno de anotações e código interativo.",
  };
}

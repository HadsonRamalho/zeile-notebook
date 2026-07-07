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
      <RustInteractivePage
        pageId={pageId}
        header={
          <div className="flex flex-col gap-3 mb-8 rounded-xl border bg-card p-4 md:p-6 shadow-sm">
            <NotebookTitle pageId={pageId} />
            <p className="text-muted-foreground text-xs font-mono">ID: {pageId}</p>
            <div>
              <NotebookControls />
            </div>
          </div>
        }
      />
    </NotebookProvider>
  );
}

export function generateMetadata(): Metadata {
  return {
    title: "Zeile Notebook",
    description: "Caderno de anotações e código interativo.",
  };
}

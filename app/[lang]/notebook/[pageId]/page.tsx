import type { Metadata } from "next";
import { NotebookProvider } from "@/components/notebook/notebook-context";
import { NotebookControls } from "@/components/notebook/notebook-controls";
import RustInteractivePage from "@/components/notebook/notebook-page";
import { NotebookTags } from "@/components/notebook/notebook-tags";
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
          <div className="flex flex-col gap-4 border-b border-border pb-6 mb-8">
            <NotebookTitle pageId={pageId} />
            <NotebookTags pageId={pageId} />
            <NotebookControls />
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

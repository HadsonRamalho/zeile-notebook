import type { Metadata } from "next";
import { NotebookControls } from "@/features/notebook/components/notebook-controls";
import RustInteractivePage from "@/features/notebook/components/notebook-page";
import { NotebookTags } from "@/features/notebook/components/notebook-tags";
import { NotebookTitle } from "@/features/notebook/components/notebook-title";
import { NotebookProvider } from "@/features/notebook/context/notebook-context";

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

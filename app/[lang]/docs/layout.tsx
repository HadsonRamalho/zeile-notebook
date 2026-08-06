import { NextIntlClientProvider, useMessages } from "next-intl";
import { DocsLayout } from "@/components/docs/layout-index";
import { useBaseOptions } from "@/components/docs/layout-shared";
import { GoToNotebooksButton } from "@/features/notebook/components/go-to-notebooks-button";
import { getPageTree } from "@/lib/docs";

export default function Layout({ children }: LayoutProps<"/[lang]/docs">) {
  const messages = useMessages();

  const tree = getPageTree();
  const filteredTree = {
    ...tree,
    children: tree.children.filter((node) => {
      return !(
        node.type === "folder" && ["privacy", "terms"].includes(node.name)
      );
    }),
  };

  return (
    <NextIntlClientProvider messages={messages}>
      <DocsLayout
        tree={filteredTree}
        {...useBaseOptions({ variant: "docs" })}
        sidebar={{
          banner: <GoToNotebooksButton className="mb-1" />,
        }}
      >
        {children}
      </DocsLayout>
    </NextIntlClientProvider>
  );
}

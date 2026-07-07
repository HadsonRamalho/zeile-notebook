import { NextIntlClientProvider, useMessages } from "next-intl";
import { DocsLayout } from "@/components/layout/docs";
import { GoToNotebooksButton } from "@/components/notebook/go-to-notebooks-button";
import { env } from "@/lib/env";
import { getPageTree } from "@/lib/docs";
import { baseOptions } from "@/lib/layout.shared";

export default function Layout({ children }: LayoutProps<"/[lang]/docs">) {
  const messages = useMessages();

  env.loadEnv();
  const mode = env.get("NEXT_PUBLIC_MODE");
  const tree = getPageTree();
  const filteredTree = {
    ...tree,
    children: tree.children.filter((node) => {
      if (node.type === "folder" && ["privacy", "terms"].includes(node.name)) {
        return false;
      }
      if (mode === "NO_ENDPOINTS") {
        return !(node.type === "folder" && node.name === "api-reference");
      }
      return true;
    }),
  };

  return (
    <NextIntlClientProvider messages={messages}>
      <DocsLayout
        tree={filteredTree}
        {...baseOptions({ variant: "docs" })}
        sidebar={{
          banner: <GoToNotebooksButton className="mb-1" />,
        }}
      >
        {children}
      </DocsLayout>
    </NextIntlClientProvider>
  );
}

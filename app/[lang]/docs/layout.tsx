import { NextIntlClientProvider, useMessages } from "next-intl";
import { DocsLayout } from "@/components/layout/docs";
import { GoToNotebooksButton } from "@/components/notebook/go-to-notebooks-button";
import { env } from "@/lib/env";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

export default function Layout({ children }: LayoutProps<"/[lang]/docs">) {
  const messages = useMessages();

  const mode = env.get("NEXT_PUBLIC_MODE");
  const tree = source.getPageTree();
  const filteredTree = {
    ...tree,
    children: tree.children.filter((node) => {
      if (mode === "NO_ENDPOINTS") {
        const isApiNode =
          node.type === "folder" && node.name === "API Reference";

        return !isApiNode;
      }

      return true;
    }),
  };

  return (
    <NextIntlClientProvider messages={messages}>
      <DocsLayout
        tree={filteredTree}
        {...baseOptions({ variant: "default" })}
        sidebar={{
          defaultOpenLevel: 1,
          banner: <GoToNotebooksButton className="mb-1" />,
        }}
      >
        {children}
      </DocsLayout>
    </NextIntlClientProvider>
  );
}

import { NextIntlClientProvider, useMessages } from "next-intl";
import { DocsLayout } from "@/components/layout/docs";
import { NotebookProvider } from "@/components/notebook/notebook-context";
import { NotebookManagerProvider } from "@/components/notebook/notebook-manager";
import { TeamNotebookManagerProvider } from "@/components/notebook/team/team-notebook-manager";
import { TeamsSidebar } from "@/components/notebook/teams-sidebar";
import { UserSidebar } from "@/components/notebook/user-sidebar";
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
      <TeamNotebookManagerProvider>
        <NotebookManagerProvider>
          <NotebookProvider pageId={null}>
            <DocsLayout
              tree={filteredTree}
              {...baseOptions({ variant: "default" })}
              sidebar={{
                defaultOpenLevel: 1,
                banner: (
                  <div>
                    <UserSidebar />
                    <TeamsSidebar />
                  </div>
                ),
              }}
            >
              {children}
            </DocsLayout>
          </NotebookProvider>
        </NotebookManagerProvider>
      </TeamNotebookManagerProvider>
    </NextIntlClientProvider>
  );
}

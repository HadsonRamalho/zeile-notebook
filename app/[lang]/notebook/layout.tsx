import { HomeLayout } from "fumadocs-ui/layouts/home";
import { NextIntlClientProvider, useMessages } from "next-intl";
import { NotebookManagerProvider } from "@/components/notebook/notebook-manager";
import { NotebookSidebar } from "@/components/notebook/sidebar/notebook-sidebar";
import { TeamNotebookManagerProvider } from "@/components/notebook/team/team-notebook-manager";
import { baseOptions } from "@/lib/layout.shared";

export default function Layout({ children }: LayoutProps<"/[lang]/notebook">) {
  const messages = useMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <TeamNotebookManagerProvider>
        <NotebookManagerProvider>
          <HomeLayout {...baseOptions({ variant: "notebook" })}>
            <div className="flex flex-1 pt-14">
              <NotebookSidebar />
              <div className="flex-1 min-w-0 px-4 py-6 md:px-8">{children}</div>
            </div>
          </HomeLayout>
        </NotebookManagerProvider>
      </TeamNotebookManagerProvider>
    </NextIntlClientProvider>
  );
}

import { NextIntlClientProvider, useMessages } from "next-intl";
import { AppShell } from "@/components/layout/app-shell";
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
          <AppShell nav={baseOptions({ variant: "notebook" }).nav?.component}>
            <div className="flex flex-1 pt-14">
              <NotebookSidebar />
              <div className="flex-1 min-w-0 py-6 pl-8 pr-4 md:pl-12 md:pr-8">{children}</div>
            </div>
          </AppShell>
        </NotebookManagerProvider>
      </TeamNotebookManagerProvider>
    </NextIntlClientProvider>
  );
}

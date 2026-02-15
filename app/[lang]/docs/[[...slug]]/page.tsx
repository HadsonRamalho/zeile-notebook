import { createRelativeLink } from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InlineTOC } from "@/components/inline-toc";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "@/components/layout/notebook/page";
import { NotebookProvider } from "@/components/notebook/notebook-context";
import { NotebookControls } from "@/components/notebook/notebook-controls";
import RustInteractivePage from "@/components/notebook/notebook-page";
import { NotebookTitle } from "@/components/notebook/notebook-title";
import { env } from "@/lib/env";
import { formatFullDate } from "@/lib/formatFullDate";
import { getPageImage, source } from "@/lib/source";
import { getMDXComponents } from "@/mdx-components";

export const dynamicParams = true;

type UpdatedAtProps = {
  date: Date;
};

function UpdatedAt({ date }: UpdatedAtProps) {
  return (
    <span className="text-sm text-fd-muted-foreground">
      Última atualização em: {formatFullDate(date)}
    </span>
  );
}

export default async function Page(
  props: PageProps<"/[lang]/docs/[[...slug]]">,
) {
  const params = await props.params;
  const page = source.getPage(params.slug);

  if (page) {
    const lastModifiedTime = page.data.lastModified;
    if (page.data.title === "API Reference") {
      const mode = env.get("NEXT_PUBLIC_MODE");
      if (mode === "NO_ENDPOINTS") {
        return (
          <DocsPage toc={page.data.toc}>
            <DocsTitle>Conteúdo indisponível</DocsTitle>
            <DocsDescription className="mb-0">
              Os endpoints não estão disponíveis no momento, pois o MODE da API
              está configurado como {mode}.
            </DocsDescription>
            <DocsBody />
          </DocsPage>
        );
      }
    }
    const MDX = page.data.body;

    return (
      <DocsPage toc={undefined}>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription>{page.data.description}</DocsDescription>
        {lastModifiedTime && <UpdatedAt date={lastModifiedTime} />}
        <DocsBody className="grid xl:grid-cols-[1fr_250px] gap-8 max-w-none! w-full">
          <div className="min-w-0">
            <MDX
              components={getMDXComponents({
                a: createRelativeLink(source, page),
              })}
            />
          </div>
          <aside className="hidden xl:block">
            <div className="sticky top-24">
              <InlineTOC tocItems={page.data.toc} />
            </div>
          </aside>
        </DocsBody>
      </DocsPage>
    );
  }

  if (params.slug && params.slug.length === 1) {
    const pageId = params.slug[0];
    return (
      <NotebookProvider pageId={pageId}>
        <DocsPage className="flex flex-col max-w-none!">
          <div className="flex flex-col mb-8 max-w-none!">
            <NotebookTitle pageId={pageId} />
            <p className="text-muted-foreground text-xs mt-1 font-mono">
              ID: {pageId}
            </p>
            <div className="mt-2 md:w-330">
              <NotebookControls />
            </div>
          </div>

          <DocsBody>
            <RustInteractivePage pageId={pageId} />
          </DocsBody>
        </DocsPage>
      </NotebookProvider>
    );
  }

  if (!page) notFound();
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);

  if (page) {
    return {
      title: page.data.title,
      description: page.data.description,
      openGraph: {
        images: getPageImage(page).url,
      },
    };
  }

  if (params.slug && params.slug.length === 1) {
    return {
      title: "Zeile Notebook",
      description: "Caderno de anotações e código interativo.",
    };
  }

  return notFound();
}

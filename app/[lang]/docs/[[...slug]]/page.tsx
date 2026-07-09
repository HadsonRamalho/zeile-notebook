import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { InlineTOC } from "@/components/inline-toc";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "@/components/layout/docs/page";
import { getDocPage, getDocPages, getDocSource, getHeadings } from "@/lib/docs";
import { getMDXComponents } from "@/mdx-components";

export const dynamicParams = true;

export default async function Page(
  props: PageProps<"/[lang]/docs/[[...slug]]">,
) {
  const params = await props.params;
  const slug = params.slug ?? [];
  const page = getDocPage(slug);

  if (!page) notFound();

  const source = getDocSource(page);
  const toc = getHeadings(source);

  return (
    <DocsPage toc={toc}>
      <div className="max-w-[850px]">
        <DocsTitle>{page.frontmatter.title}</DocsTitle>
        <DocsDescription>{page.frontmatter.description}</DocsDescription>
      </div>
      <DocsBody className="grid xl:grid-cols-[1fr_250px] gap-8 max-w-none! w-full">
        <div className="min-w-0">
          <MDXRemote
            source={source}
            components={getMDXComponents()}
            options={{
              mdxOptions: {
                remarkPlugins: [remarkGfm],
                rehypePlugins: [rehypeSlug],
              },
            }}
          />
        </div>
        <aside className="hidden xl:block">
          <div className="sticky top-24">
            <InlineTOC tocItems={toc} />
          </div>
        </aside>
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return ["pt-br", "en"].flatMap((lang) =>
    getDocPages().map((page) => ({ lang, slug: page.slugs })),
  );
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const params = await props.params;
  const page = getDocPage(params.slug ?? []);

  if (!page) return notFound();

  return {
    title: page.frontmatter.title,
    description: page.frontmatter.description,
    openGraph: {
      images: `/og/docs/${[...page.slugs, "image.png"].join("/")}`,
    },
  };
}

import { notFound } from "next/navigation";
import { ImageResponse } from "next/og";
import { getDocPage, getDocPages } from "@/lib/docs";

export const revalidate = false;

export async function GET(
  _req: Request,
  { params }: RouteContext<"/[lang]/og/docs/[...slug]">,
) {
  const { slug } = await params;
  const page = getDocPage(slug.slice(0, -1));
  if (!page) notFound();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          padding: "80px",
          background: "#0a0a0a",
          color: "white",
        }}
      >
        <div style={{ fontSize: 16, color: "#169e69", marginBottom: 16 }}>
          Docs
        </div>
        <div style={{ fontSize: 64, fontWeight: 700 }}>
          {page.frontmatter.title}
        </div>
        {page.frontmatter.description && (
          <div style={{ fontSize: 28, color: "#a1a1aa", marginTop: 24 }}>
            {page.frontmatter.description}
          </div>
        )}
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}

export function generateStaticParams() {
  return ["pt-br", "en"].flatMap((lang) =>
    getDocPages().map((page) => ({
      lang,
      slug: [...page.slugs, "image.png"],
    })),
  );
}

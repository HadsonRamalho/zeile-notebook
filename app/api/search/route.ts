import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { api } from "@/lib/api/base";
import { getDocPages } from "@/lib/docs";

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function generateHighlights(text: string, query: string) {
  if (!query || !text) return [{ type: "text", content: text || "" }];

  const regex = new RegExp(`(${escapeRegExp(query)})`, "gi");
  const parts = text.split(regex);
  const result = [];

  for (const part of parts) {
    if (part) {
      if (part.toLowerCase() === query.toLowerCase()) {
        result.push({
          type: "text",
          content: part,
          styles: { highlight: true },
        });
      } else {
        result.push({
          type: "text",
          content: part,
        });
      }
    }
  }
  return result;
}

function searchDocs(query: string) {
  const lowerQuery = query.toLowerCase();

  return getDocPages()
    .filter(
      (page) =>
        page.frontmatter.title.toLowerCase().includes(lowerQuery) ||
        page.frontmatter.description?.toLowerCase().includes(lowerQuery),
    )
    .map((page) => ({
      id: page.url,
      type: "page" as const,
      url: page.url,
      content: page.frontmatter.title,
      contentWithHighlights: generateHighlights(
        page.frontmatter.title,
        query,
      ),
    }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");

  let results: unknown[] = query ? searchDocs(query) : [];

  if (!query) {
    return NextResponse.json(results);
  }

  try {
    const token = (await cookies()).get("auth_token")?.value;

    if (token) {
      const rustResponse: any = await api.get<any[]>(
        `/notebook/search/?q=${encodeURIComponent(query)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const dynamicResults = rustResponse.flatMap((page: any) => {
        const url = `/notebook/${page.id}`;
        const nodes = [];

        nodes.push({
          id: `${page.id}`,
          type: "page",
          url: url,
          content: page.title,
          contentWithHighlights: generateHighlights(page.title, query),
        });

        if (page.content) {
          const contentStr = String(page.content);
          const matchIndex = contentStr
            .toLowerCase()
            .indexOf(query.toLowerCase());

          let snippet = contentStr;
          if (matchIndex !== -1) {
            const start = Math.max(0, matchIndex - 40);
            const end = Math.min(
              contentStr.length,
              matchIndex + query.length + 40,
            );
            snippet = contentStr.substring(start, end);
            if (start > 0) snippet = `...${snippet}`;
            if (end < contentStr.length) snippet = `${snippet}...`;
          } else if (contentStr.length > 80) {
            snippet = `${contentStr.substring(0, 80)}...`;
          }

          nodes.push({
            id: `notebook-text-${page.id}`,
            type: "text",
            url: url,
            content: snippet,
            contentWithHighlights: generateHighlights(snippet, query),
          });
        }

        return nodes;
      });

      results = [...dynamicResults, ...results];
    }
  } catch (error) {
    console.error("Erro ao buscar no notebook:", error);
  }

  return NextResponse.json(results);
}

import { NextResponse } from "next/server";
import { routeError } from "@/lib/api/route-error";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  if (!owner || !repo) {
    return routeError(
      "GITHUB_REPO_PARAMS_MISSING",
      "Usuário ou repositório não encontrado",
      400,
    );
  }

  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          ...(GITHUB_TOKEN && { Authorization: `Bearer ${GITHUB_TOKEN}` }),
          "Content-Type": "application/json",
        },
        next: { revalidate: 3600 },
      },
    );

    if (!response.ok) {
      return routeError(
        "GITHUB_API_ERROR",
        "Erro na API do GitHub",
        response.status,
      );
    }

    const data = await response.json();
    return NextResponse.json({ stars: data.stargazers_count });
  } catch (_error) {
    return routeError("GITHUB_INTERNAL_ERROR", "Erro interno no servidor", 500);
  }
}

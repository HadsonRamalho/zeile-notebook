import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Usuário ou repositório não encontrado" },
      { status: 400 },
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
      return NextResponse.json(
        { error: "Erro na API do GitHub" },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json({ stars: data.stargazers_count });
  } catch (error) {
    return NextResponse.json(
      { error: "Erro interno no servidor, hehe ;)" },
      { status: 500 },
    );
  }
}

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..");

const DIRETORIOS = ["app", "lib", "components", "hooks", "context"];
const ARQUIVOS_SOLTOS = [
  "env.example",
  "next.config.mjs",
  join("rust-server", ".env.example"),
];

const EXTENSOES = [".ts", ".tsx", ".mjs", ".js"];

const PUBLICAS_POR_DESIGN = new Set(["NEXT_PUBLIC_VAPID_PUBLIC_KEY"]);

const CHEIRO_DE_SEGREDO =
  /(TOKEN|SECRET|PASSWORD|PRIVATE|CREDENTIAL|_KEY$|_KEYS$)/;

function arquivos(dir: string): string[] {
  const encontrados: string[] = [];

  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;

    const caminho = join(dir, entrada);

    if (statSync(caminho).isDirectory()) {
      encontrados.push(...arquivos(caminho));
      continue;
    }

    if (caminho.includes(".test.")) continue;

    if (EXTENSOES.some((ext) => caminho.endsWith(ext))) {
      encontrados.push(caminho);
    }
  }

  return encontrados;
}

function variaveisPublicas(): Map<string, string[]> {
  const alvos = [
    ...DIRETORIOS.flatMap((dir) => arquivos(join(RAIZ, dir))),
    ...ARQUIVOS_SOLTOS.map((arquivo) => join(RAIZ, arquivo)),
  ];

  const encontradas = new Map<string, string[]>();

  for (const caminho of alvos) {
    const conteudo = readFileSync(caminho, "utf8");

    for (const nome of conteudo.match(/NEXT_PUBLIC_[A-Z0-9_]+/g) ?? []) {
      const origens = encontradas.get(nome) ?? [];
      origens.push(caminho.replace(`${RAIZ}/`, ""));
      encontradas.set(nome, origens);
    }
  }

  return encontradas;
}

describe("variables exposed to the client", () => {
  it("the scanner sees the variables that exist today", () => {
    const nomes = [...variaveisPublicas().keys()];

    expect(nomes).toContain("NEXT_PUBLIC_API");
    expect(nomes.length).toBeGreaterThan(3);
  });

  it("nenhuma NEXT_PUBLIC_ carrega nome de segredo", () => {
    const suspeitas = [...variaveisPublicas().entries()].filter(
      ([nome]) =>
        CHEIRO_DE_SEGREDO.test(nome) && !PUBLICAS_POR_DESIGN.has(nome),
    );

    expect(
      suspeitas.map(([nome, origens]) => `${nome} em ${origens.join(", ")}`),
    ).toEqual([]);
  });

  it("GITHUB_TOKEN has no public prefix anywhere", () => {
    expect([...variaveisPublicas().keys()]).not.toContain(
      "NEXT_PUBLIC_GITHUB_TOKEN",
    );
  });
});

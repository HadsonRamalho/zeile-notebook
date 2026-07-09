export interface TypstSnippet {
  svg: (o: { mainContent: string }) => Promise<string>;
  pdf: (o: { mainContent: string }) => Promise<Uint8Array | undefined>;
  canvas: (
    container: HTMLElement,
    o: { mainContent: string },
  ) => Promise<void>;
}

const TYPST_BUNDLE_URL =
  "https://cdn.jsdelivr.net/npm/@myriaddreamin/typst.ts@0.7.0/dist/esm/contrib/all-in-one-lite.bundle.js";

// import() dinâmico via Function evita que o bundler tente resolver a URL do
// CDN em tempo de build — o pacote só é buscado quando um bloco Typst existe.
const dynamicImport = new Function(
  "specifier",
  "return import(specifier)",
) as (specifier: string) => Promise<{ $typst: TypstSnippet }>;

let typstPromise: Promise<TypstSnippet> | null = null;

export async function getTypst(): Promise<TypstSnippet> {
  if (typeof window === "undefined") {
    throw new Error("Typst só pode ser carregado no navegador.");
  }

  if (!typstPromise) {
    typstPromise = dynamicImport(TYPST_BUNDLE_URL).then((mod) => mod.$typst);
  }

  return typstPromise;
}

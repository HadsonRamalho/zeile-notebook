export interface TypstSnippet {
  svg: (o: { mainContent: string }) => Promise<string>;
  pdf: (o: { mainContent: string }) => Promise<Uint8Array | undefined>;
  canvas: (
    container: HTMLElement,
    o: { mainContent: string },
  ) => Promise<void>;
  setCompilerInitOptions: (options: { getModule: () => string }) => void;
  setRendererInitOptions: (options: { getModule: () => string }) => void;
}

const TYPST_VERSION = "0.7.0";

const TYPST_BUNDLE_URL = `https://cdn.jsdelivr.net/npm/@myriaddreamin/typst.ts@${TYPST_VERSION}/dist/esm/contrib/all-in-one-lite.bundle.js`;

const TYPST_COMPILER_WASM_URL = `https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler@${TYPST_VERSION}/pkg/typst_ts_web_compiler_bg.wasm`;

const TYPST_RENDERER_WASM_URL = `https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-renderer@${TYPST_VERSION}/pkg/typst_ts_renderer_bg.wasm`;

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
    typstPromise = dynamicImport(TYPST_BUNDLE_URL).then((mod) => {
      mod.$typst.setCompilerInitOptions({
        getModule: () => TYPST_COMPILER_WASM_URL,
      });
      mod.$typst.setRendererInitOptions({
        getModule: () => TYPST_RENDERER_WASM_URL,
      });
      return mod.$typst;
    });
  }

  return typstPromise;
}

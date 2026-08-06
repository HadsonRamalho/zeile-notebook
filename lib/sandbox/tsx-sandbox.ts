import { catchErrorSync, err, ok, type Result } from "@catcherjs/core";
import { ApiClientError } from "@/lib/api/base";
import type { Block } from "@/types/block-types";

interface BabelGlobal {
  transform: (
    code: string,
    options: { filename: string; presets: string[]; plugins: unknown[][] },
  ) => { code: string };
}

export function runTsxInSandbox(
  block: Block,
  pageBlocks: Block[],
): Result<string | null, ApiClientError | Error> {
  if (typeof window === "undefined") {
    console.error("Window is not defined");
    return ok(null);
  }

  const babel = (window as unknown as { Babel?: BabelGlobal }).Babel;

  if (!babel) {
    return err(
      new ApiClientError(
        "O Babel ainda está sendo carregado, aguarde alguns instantes.",
        "BABEL_NOT_READY",
      ),
    );
  }

  const transpileResult = catchErrorSync(() => {
    const modulesData = pageBlocks
      .filter(
        (b) =>
          b.type === "code" && b.id !== block.id && b.language === "typescript",
      )
      .reduce(
        (acc, b) => {
          const name = `./${b.title.replace(/[^a-zA-Z0-9]/g, "_")}`;
          const { code: transpilado } = babel.transform(b.content, {
            filename: "module.tsx",
            presets: ["react", "typescript"],
            plugins: [["transform-modules-commonjs"]],
          });
          acc[name] = transpilado;
          return acc;
        },
        {} as Record<string, string>,
      );

    const { code: mainCodeTranspiled } = babel.transform(block.content, {
      filename: "App.tsx",
      presets: ["react", "typescript"],
      plugins: [["transform-modules-commonjs"]],
    });

    return { modulesData, mainCodeTranspiled };
  });

  if (transpileResult.isErr()) return err(transpileResult.error);
  const { modulesData, mainCodeTranspiled } = transpileResult.data;

  const iframeHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <script type="importmap">
            { "imports": {
              "react": "https://esm.sh/react@18",
              "react-dom/client": "https://esm.sh/react-dom@18/client"
            }}
          </script>
        </head>
        <body style="margin:0; background: #1a1a1a; color: white; font-family: sans-serif;">
          <div id="root"></div>
          <script type="module">
            import React from "react";
            import ReactDOM from "react-dom/client";
            window.React = React;
            Object.defineProperty(window, 'parent', { get: () => undefined });

            const virtualFS = ${JSON.stringify(modulesData)};
            const mainCode = ${JSON.stringify(mainCodeTranspiled)};
            const cache = {};

            function require(path) {
              if (path === "react") return React;
              if (cache[path]) return cache[path].exports;
              const code = virtualFS[path];
              if (!code) throw new Error("Módulo não encontrado: " + path);
              const module = { exports: {} };
              cache[path] = module;
              new Function("exports", "module", "require", "React", code)(module.exports, module, require, React);
              return module.exports;
            }

            try {
              const mainModule = { exports: {} };
              new Function("exports", "module", "require", "React", mainCode)(mainModule.exports, mainModule, require, React);

              const Component = mainModule.exports.default || mainModule.exports.App || window.App;

              if (Component) {
                const root = ReactDOM.createRoot(document.getElementById("root"));
                root.render(React.createElement(Component));
              } else {
                throw new Error("Componente App não encontrado. Verifique se usou 'export default' ou 'function App'");
              }
            } catch (e) {
              document.getElementById("root").innerHTML = "<div style='color:#ff5555; padding:20px; font-family:monospace;'><b>Erro de Execução:</b><br/>" + e.message + "</div>";
            }
          </script>
        </body>
      </html>
    `;
  const blob = new Blob([iframeHtml], { type: "text/html" });
  return ok(URL.createObjectURL(blob));
}

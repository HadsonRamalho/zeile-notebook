import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zeile Notebook",
    short_name: "Zeile Notebook",
    description:
      "Plataforma baseada em blocos para criação de notebooks interativos. Permite documentação em Markdown e execução de código nativo em ambiente remoto isolado.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    id: "com.zeile.app.notebook",
    categories: ["productivity", "education", "developer"],
    dir: "ltr",
    lang: "pt-BR",
    scope: "/",
    launch_handler: {
      client_mode: ["navigate-existing", "auto"],
    },
    shortcuts: [
      {
        name: "Página Inicial",
        url: "/",
        icons: [
          {
            src: "/icon-128.png",
            sizes: "128x128",
            type: "image/png",
          },
          {
            src: "/logo.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
        description: "Acessar a página inicial do Zeile.",
      },
      {
        name: "Explorar",
        url: "/explore",
        description: "Explorar cadernos públicos e da comunidade.",
        icons: [
          {
            src: "/icon-128.png",
            sizes: "128x128",
            type: "image/png",
          },
          {
            src: "/logo.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      {
        name: "Documentação",
        url: "/docs",
        icons: [
          {
            src: "/icon-128.png",
            sizes: "128x128",
            type: "image/png",
          },
          {
            src: "/logo.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
        description: "Acessar a documentação, políticas e termos.",
      },
    ],
    theme_color: "#169e69",
    display_override: ["standalone", "browser"],
    icons: [
      {
        src: "/icon-128.png",
        sizes: "128x128",
        type: "image/png",
      },
      {
        src: "/logo.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}

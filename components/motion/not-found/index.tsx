import { NotFoundGlitch } from "./glitch";
import { NotFoundStacked } from "./stacked";

export function AppNotFound({
  variant = "not-found",
}: {
  variant?: "not-found" | "forbidden";
}) {
  if (variant === "forbidden") {
    return (
      <NotFoundStacked
        code="403"
        title="Sem permissão"
        description="Você não tem permissão para visualizar esta página. Peça acesso a quem administra este espaço."
      />
    );
  }

  return (
    <NotFoundGlitch
      code="404"
      title="Página não encontrada"
      description="A página que você procura foi movida, apagada ou nunca existiu."
    />
  );
}

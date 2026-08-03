"use client";

import { Link2, Link2Off } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { GithubIcon } from "@/components/icons/github-icon";
import { GoogleIcon } from "@/components/icons/google-icon";
import { Loader } from "@/components/motion/loader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthProviders } from "@/lib/api/auth-service";
import { ApiClientError } from "@/lib/api/base";
import {
  getAuthMethods,
  startProviderLink,
  unlinkProvider,
} from "@/lib/api/user-service";
import type { AuthMethods, OAuthProviderSlug } from "@/lib/types/user-types";

const ICONES: Record<OAuthProviderSlug, () => React.ReactNode> = {
  github: GithubIcon,
  google: GoogleIcon,
};

const NOMES: Record<OAuthProviderSlug, string> = {
  github: "GitHub",
  google: "Google",
};

export function ProfileConnections() {
  const t = useTranslations("profile.connections");
  const searchParams = useSearchParams();
  const [disponiveis, setDisponiveis] = useState<OAuthProviderSlug[]>([]);
  const [metodos, setMetodos] = useState<AuthMethods | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [emAcao, setEmAcao] = useState<OAuthProviderSlug | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [providers, methods] = await Promise.all([
        getAuthProviders(),
        getAuthMethods(),
      ]);

      setDisponiveis(providers.providers);
      setMetodos(methods);
    } catch {
      setDisponiveis([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const vinculado = searchParams.get("linked");
    const erro = searchParams.get("link_error");

    if (vinculado) {
      toast.success(
        t("linked_success", {
          provider: NOMES[vinculado as OAuthProviderSlug] ?? vinculado,
        }),
      );
    }

    if (erro) {
      toast.error(
        erro === "already_linked"
          ? t("errors.already_linked")
          : t("errors.link_failed"),
      );
    }
  }, [searchParams, t]);

  const vincular = async (provider: OAuthProviderSlug) => {
    setEmAcao(provider);
    try {
      const { url } = await startProviderLink(provider);
      window.location.href = url;
    } catch {
      toast.error(t("errors.link_failed"));
      setEmAcao(null);
    }
  };

  const desvincular = async (provider: OAuthProviderSlug) => {
    setEmAcao(provider);
    try {
      await unlinkProvider(provider);
      toast.success(t("unlinked_success", { provider: NOMES[provider] }));
      await carregar();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "LAST_LOGIN_METHOD") {
        toast.error(t("errors.last_login_method"));
      } else {
        toast.error(t("errors.unlink_failed"));
      }
    } finally {
      setEmAcao(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex h-24 items-center justify-center">
          <Loader variant="spinner" size={16} />
        </CardContent>
      </Card>
    );
  }

  if (disponiveis.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {disponiveis.map((provider) => {
          const Icone = ICONES[provider];
          const vinculado = metodos?.providers.includes(provider) ?? false;
          const ultimoMetodo = vinculado && (metodos?.providers.length ?? 0) + (metodos?.password ? 1 : 0) < 2;

          return (
            <div
              key={provider}
              className="grid grid-cols-1 gap-3 md:flex md:items-center md:justify-between rounded-lg border px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Icone />
                <div className="space-y-0.5">
                  <p className="font-medium">{NOMES[provider]}</p>
                  <p className="text-sm text-muted-foreground">
                    {vinculado ? t("status_linked") : t("status_unlinked")}
                  </p>
                </div>
              </div>

              {vinculado ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={emAcao === provider || ultimoMetodo}
                  onClick={() => desvincular(provider)}
                >
                  <Link2Off className="mr-2 h-4 w-4" />
                  {t("unlink")}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={emAcao === provider}
                  onClick={() => vincular(provider)}
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  {t("link")}
                </Button>
              )}
            </div>
          );
        })}

        {metodos && !metodos.password && (
          <p className="text-sm text-muted-foreground">
            {t("set_password_hint")}{" "}
            <Link href="/forgot-password" className="underline">
              {t("set_password_link")}
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

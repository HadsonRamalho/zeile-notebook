import { deleteCookie, getCookie, setCookie } from "cookies-next";
import {
  type AccountType,
  REFRESH_COOKIE_MAX_AGE,
  getActiveAccount,
  refreshCookieName,
  resolve,
  tokenCookieName,
} from "@/lib/runtime/router";

export interface Sessao {
  accessToken: string;
  refreshToken: string;
  expiresInSecs: number;
}

/// Margem para renovar antes do fim: o cookie do access token expira um pouco
/// antes do token em si, então o cliente não chega a mandar um token vencido.
const MARGEM_SEGS = 30;

export function guardarSessao(
  sessao: Sessao,
  account: AccountType = getActiveAccount(),
) {
  const maxAge = Math.max(sessao.expiresInSecs - MARGEM_SEGS, 60);

  setCookie(tokenCookieName(account), sessao.accessToken, { maxAge });
  setCookie(refreshCookieName(account), sessao.refreshToken, {
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
}

export function limparSessao(account: AccountType = getActiveAccount()) {
  deleteCookie(tokenCookieName(account));
  deleteCookie(refreshCookieName(account));
}

export function refreshTokenGuardado(
  account: AccountType = getActiveAccount(),
): string | undefined {
  return getCookie(refreshCookieName(account)) as string | undefined;
}

// Uma renovação por vez. Sem isso, um surto de requisições expiradas renovaria
// em paralelo: a primeira rotação invalida o refresh das outras, o servidor lê
// isso como reuso de token vazado e derruba todas as sessões do usuário.
let renovacaoEmCurso: Promise<string | null> | null = null;

export function renovarSessao(
  account: AccountType = getActiveAccount(),
): Promise<string | null> {
  renovacaoEmCurso ??= executarRenovacao(account).finally(() => {
    renovacaoEmCurso = null;
  });

  return renovacaoEmCurso;
}

async function executarRenovacao(account: AccountType): Promise<string | null> {
  const refreshToken = refreshTokenGuardado(account);

  if (!refreshToken) {
    return null;
  }

  const target = resolve("auth", account);

  try {
    const response = await fetch(`${target.baseUrl}/user/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      limparSessao(account);
      return null;
    }

    const sessao: Sessao = await response.json();
    guardarSessao(sessao, account);

    return sessao.accessToken;
  } catch {
    // Falha de rede não é sessão inválida: manter o refresh permite tentar de
    // novo quando a conexão voltar.
    return null;
  }
}

export async function encerrarSessaoNoServidor(
  account: AccountType = getActiveAccount(),
) {
  const refreshToken = refreshTokenGuardado(account);

  if (!refreshToken) {
    return;
  }

  const target = resolve("auth", account);

  try {
    await fetch(`${target.baseUrl}/user/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Logout local acontece de qualquer forma.
  }
}

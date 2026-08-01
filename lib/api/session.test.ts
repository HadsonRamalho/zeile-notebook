import { beforeEach, describe, expect, it, vi } from "vitest";

const cookies = new Map<string, string>();

vi.mock("cookies-next", () => ({
  getCookie: (nome: string) => cookies.get(nome),
  setCookie: (nome: string, valor: string) => {
    cookies.set(nome, valor);
  },
  deleteCookie: (nome: string) => {
    cookies.delete(nome);
  },
}));

vi.mock("@/lib/runtime/router", () => ({
  REFRESH_COOKIE_MAX_AGE: 60 * 60 * 24 * 30,
  getActiveAccount: () => "cloud" as const,
  tokenCookieName: () => "auth_token",
  refreshCookieName: () => "refresh_token",
  resolve: () => ({ baseUrl: "https://api.test/api" }),
}));

const {
  guardarSessao,
  limparSessao,
  refreshTokenGuardado,
  renovarSessao,
  encerrarSessaoNoServidor,
} = await import("./session");

function sessao(sufixo: string) {
  return {
    accessToken: `access-${sufixo}`,
    refreshToken: `refresh-${sufixo}`,
    expiresInSecs: 900,
  };
}

describe("sessão do cliente", () => {
  beforeEach(() => {
    cookies.clear();
    vi.restoreAllMocks();
  });

  it("guarda e limpa os dois tokens", () => {
    guardarSessao(sessao("um"));

    expect(cookies.get("auth_token")).toBe("access-um");
    expect(refreshTokenGuardado()).toBe("refresh-um");

    limparSessao();

    expect(cookies.get("auth_token")).toBeUndefined();
    expect(refreshTokenGuardado()).toBeUndefined();
  });

  it("não tenta renovar sem refresh token guardado", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(renovarSessao()).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renova e passa a usar o par novo", async () => {
    guardarSessao(sessao("velho"));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => sessao("novo"),
      })),
    );

    await expect(renovarSessao()).resolves.toBe("access-novo");
    expect(cookies.get("auth_token")).toBe("access-novo");
    expect(refreshTokenGuardado()).toBe("refresh-novo");
  });

  it("colapsa renovações concorrentes numa só chamada", async () => {
    guardarSessao(sessao("velho"));

    let chamadas = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        chamadas += 1;
        await new Promise((r) => setTimeout(r, 10));
        return { ok: true, json: async () => sessao("novo") };
      }),
    );

    const resultados = await Promise.all([
      renovarSessao(),
      renovarSessao(),
      renovarSessao(),
    ]);

    expect(chamadas).toBe(1);
    expect(resultados).toEqual(["access-novo", "access-novo", "access-novo"]);
  });

  it("libera a próxima renovação depois de terminar", async () => {
    guardarSessao(sessao("velho"));

    let chamadas = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        chamadas += 1;
        return { ok: true, json: async () => sessao(`n${chamadas}`) };
      }),
    );

    await renovarSessao();
    await renovarSessao();

    expect(chamadas).toBe(2);
  });

  it("apaga a sessão quando o servidor recusa o refresh", async () => {
    guardarSessao(sessao("gasto"));

    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401 })));

    await expect(renovarSessao()).resolves.toBeNull();
    expect(refreshTokenGuardado()).toBeUndefined();
  });

  it("preserva o refresh token quando a rede falha", async () => {
    guardarSessao(sessao("vivo"));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );

    await expect(renovarSessao()).resolves.toBeNull();

    // Queda de rede não é sessão inválida: descartar aqui deslogaria quem
    // apenas perdeu conexão.
    expect(refreshTokenGuardado()).toBe("refresh-vivo");
  });

  it("avisa o servidor no logout", async () => {
    guardarSessao(sessao("aberta"));

    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
    }));
    vi.stubGlobal("fetch", fetchSpy);

    await encerrarSessaoNoServidor();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toContain("/user/logout");
    expect(String(init.body)).toContain("refresh-aberta");
  });
});

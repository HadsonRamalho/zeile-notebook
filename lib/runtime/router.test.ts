import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookies = new Map<string, string>();

vi.mock("cookies-next", () => ({
  getCookie: (name: string) => cookies.get(name),
  setCookie: (name: string, value: string) => {
    cookies.set(name, value);
  },
}));

const REMOTE_API = "https://nuvem.zeile.test/api";
const REMOTE_WS = "https://ws.zeile.test/api";
const LOCAL_API = "http://127.0.0.1:3099/api";
const LOCAL_WS_HOST = "127.0.0.1:3099";

async function loadRouter(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  process.env.NEXT_PUBLIC_API = REMOTE_API;
  process.env.NEXT_PUBLIC_WS_URL = REMOTE_WS;
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return import("./router");
}

function setAccount(account: "cloud" | "local") {
  cookies.set("zeile_account", account);
}

beforeEach(() => {
  cookies.clear();
  cookies.set("auth_token", "token-remoto");
  cookies.set("local_auth_token", "token-local");
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_RUNTIME;
  delete process.env.NEXT_PUBLIC_API;
  delete process.env.NEXT_PUBLIC_WS_URL;
  vi.unstubAllGlobals();
});

describe("isDesktopRuntime", () => {
  it("é true quando a env declara desktop", async () => {
    const { isDesktopRuntime } = await loadRouter({
      NEXT_PUBLIC_RUNTIME: "desktop",
    });

    expect(isDesktopRuntime()).toBe(true);
  });

  it("é false no servidor, sem window e sem env", async () => {
    const { isDesktopRuntime } = await loadRouter();

    expect(isDesktopRuntime()).toBe(false);
  });

  it("detecta o Tauri v2 por __TAURI_INTERNALS__", async () => {
    const { isDesktopRuntime } = await loadRouter();
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });

    expect(isDesktopRuntime()).toBe(true);
  });

  it("detecta o Tauri v1 por __TAURI__", async () => {
    const { isDesktopRuntime } = await loadRouter();
    vi.stubGlobal("window", { __TAURI__: {} });

    expect(isDesktopRuntime()).toBe(true);
  });

  it("é false quando há window sem marca do Tauri", async () => {
    const { isDesktopRuntime } = await loadRouter();
    vi.stubGlobal("window", {});

    expect(isDesktopRuntime()).toBe(false);
  });
});

describe("conta ativa", () => {
  it("o default é cloud quando não há cookie", async () => {
    const { getActiveAccount } = await loadRouter();

    expect(getActiveAccount()).toBe("cloud");
  });

  it("valor desconhecido no cookie cai para cloud", async () => {
    const { getActiveAccount } = await loadRouter();
    cookies.set("zeile_account", "outra-coisa");

    expect(getActiveAccount()).toBe("cloud");
  });

  it("setActiveAccount grava e getActiveAccount lê", async () => {
    const { getActiveAccount, setActiveAccount } = await loadRouter();

    setActiveAccount("local");

    expect(getActiveAccount()).toBe("local");
  });

  it("tokenCookieName segue a conta ativa", async () => {
    const { tokenCookieName } = await loadRouter();

    expect(tokenCookieName()).toBe("auth_token");
    setAccount("local");
    expect(tokenCookieName()).toBe("local_auth_token");
  });

  it("tokenCookieName aceita a conta por argumento", async () => {
    const { tokenCookieName } = await loadRouter();

    expect(tokenCookieName("local")).toBe("local_auth_token");
    expect(tokenCookieName("cloud")).toBe("auth_token");
  });
});

describe("resolve — para onde o dado vai", () => {
  it("no navegador (não desktop) tudo é remoto, mesmo com conta local", async () => {
    const { resolve } = await loadRouter();
    setAccount("local");

    const target = resolve("notebook-crud");

    expect(target.kind).toBe("remote");
    expect(target.baseUrl).toBe(REMOTE_API);
  });

  it("no desktop com conta cloud tudo é remoto", async () => {
    const { resolve } = await loadRouter({ NEXT_PUBLIC_RUNTIME: "desktop" });
    setAccount("cloud");

    expect(resolve("notebook-crud").kind).toBe("remote");
    expect(resolve("sync").kind).toBe("remote");
  });

  it("no desktop com conta local, capacidade local vai para o backend local", async () => {
    const { resolve } = await loadRouter({ NEXT_PUBLIC_RUNTIME: "desktop" });
    setAccount("local");

    const target = resolve("notebook-crud");

    expect(target.kind).toBe("local");
    expect(target.baseUrl).toBe(LOCAL_API);
    expect(target.wsHost).toBe(LOCAL_WS_HOST);
    expect(target.token).toBe("token-local");
  });

  it("no desktop com conta local, capacidade cloud-only continua remota", async () => {
    const { resolve } = await loadRouter({ NEXT_PUBLIC_RUNTIME: "desktop" });
    setAccount("local");

    for (const cap of ["teams", "chat", "templates", "public"] as const) {
      expect(resolve(cap).kind, `capacidade ${cap}`).toBe("remote");
    }
  });

  it("cada alvo carrega o token do seu próprio cookie", async () => {
    const { resolve } = await loadRouter({ NEXT_PUBLIC_RUNTIME: "desktop" });
    setAccount("local");

    expect(resolve("notebook-crud").token).toBe("token-local");
    expect(resolve("teams").token).toBe("token-remoto");
  });

  it("token vazio quando o cookie não existe", async () => {
    const { resolve } = await loadRouter();
    cookies.delete("auth_token");

    expect(resolve("notebook-crud").token).toBe("");
  });

  it("FAIL-OPEN CONHECIDO (Q99): sem capacidade, resolve manda para a nuvem", async () => {
    const { resolve } = await loadRouter({ NEXT_PUBLIC_RUNTIME: "desktop" });
    setAccount("local");

    expect(resolve().kind).toBe("remote");
  });

  it("FURO CONHECIDO (Q99 furo 2): 'public' não é capacidade local", async () => {
    const { resolve } = await loadRouter({ NEXT_PUBLIC_RUNTIME: "desktop" });
    setAccount("local");

    expect(resolve("public").kind).toBe("remote");
  });
});

describe("isCapabilityAvailable", () => {
  it("capacidade local está disponível offline", async () => {
    const { isCapabilityAvailable } = await loadRouter();

    expect(isCapabilityAvailable("notebook-crud", false)).toBe(true);
    expect(isCapabilityAvailable("sync", false)).toBe(true);
  });

  it("capacidade cloud-only exige estar online", async () => {
    const { isCapabilityAvailable } = await loadRouter();
    setAccount("cloud");

    expect(isCapabilityAvailable("teams", true)).toBe(true);
    expect(isCapabilityAvailable("teams", false)).toBe(false);
  });

  it("capacidade cloud-only exige conta cloud", async () => {
    const { isCapabilityAvailable } = await loadRouter();
    setAccount("local");

    expect(isCapabilityAvailable("teams", true)).toBe(false);
  });

  it("usa navigator.onLine quando o argumento é omitido", async () => {
    const { isCapabilityAvailable } = await loadRouter();
    setAccount("cloud");

    vi.stubGlobal("navigator", { onLine: false });
    expect(isCapabilityAvailable("teams")).toBe(false);

    vi.stubGlobal("navigator", { onLine: true });
    expect(isCapabilityAvailable("teams")).toBe(true);
  });
});

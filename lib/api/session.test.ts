import { beforeEach, describe, expect, it, vi } from "vitest";

const cookies = new Map<string, string>();

vi.mock("cookies-next", () => ({
  getCookie: (name: string) => cookies.get(name),
  setCookie: (name: string, value: string) => {
    cookies.set(name, value);
  },
  deleteCookie: (name: string) => {
    cookies.delete(name);
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
  storeSession,
  clearSession,
  storedRefreshToken,
  renewSession,
  endSessionOnServer,
} = await import("./session");

function session(suffix: string) {
  return {
    accessToken: `access-${suffix}`,
    refreshToken: `refresh-${suffix}`,
    expiresInSecs: 900,
  };
}

describe("client session", () => {
  beforeEach(() => {
    cookies.clear();
    vi.restoreAllMocks();
  });

  it("stores and clears both tokens", () => {
    storeSession(session("one"));

    expect(cookies.get("auth_token")).toBe("access-one");
    expect(storedRefreshToken()).toBe("refresh-one");

    clearSession();

    expect(cookies.get("auth_token")).toBeUndefined();
    expect(storedRefreshToken()).toBeUndefined();
  });

  it("does not try to renew without a stored refresh token", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(renewSession()).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renews and starts using the new pair", async () => {
    storeSession(session("old"));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => session("new"),
      })),
    );

    await expect(renewSession()).resolves.toBe("access-new");
    expect(cookies.get("auth_token")).toBe("access-new");
    expect(storedRefreshToken()).toBe("refresh-new");
  });

  it("collapses concurrent renewals into a single call", async () => {
    storeSession(session("old"));

    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 10));
        return { ok: true, json: async () => session("new") };
      }),
    );

    const results = await Promise.all([
      renewSession(),
      renewSession(),
      renewSession(),
    ]);

    expect(calls).toBe(1);
    expect(results).toEqual(["access-new", "access-new", "access-new"]);
  });

  it("releases the next renewal after finishing", async () => {
    storeSession(session("old"));

    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        return { ok: true, json: async () => session(`n${calls}`) };
      }),
    );

    await renewSession();
    await renewSession();

    expect(calls).toBe(2);
  });

  it("clears the session when the server refuses the refresh", async () => {
    storeSession(session("spent"));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401 })),
    );

    await expect(renewSession()).resolves.toBeNull();
    expect(storedRefreshToken()).toBeUndefined();
  });

  it("preserves the refresh token when the network fails", async () => {
    storeSession(session("alive"));

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );

    await expect(renewSession()).resolves.toBeNull();

    // A network drop is not an invalid session: discarding it here would
    // log out someone who merely lost connection.
    expect(storedRefreshToken()).toBe("refresh-alive");
  });

  it("notifies the server on logout", async () => {
    storeSession(session("open"));

    const fetchSpy = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
    }));
    vi.stubGlobal("fetch", fetchSpy);

    await endSessionOnServer();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toContain("/user/logout");
    expect(String(init.body)).toContain("refresh-open");
  });
});

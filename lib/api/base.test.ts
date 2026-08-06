import { beforeEach, describe, expect, it, vi } from "vitest";

const renewSession = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/api/session", () => ({ renewSession }));

const queueRequest = vi.fn<() => Promise<void>>();
vi.mock("@/lib/background-sync", () => ({ queueRequest }));

vi.mock("@/lib/runtime/router", () => ({
  resolve: () => ({ baseUrl: "https://api.test/api", token: "tok" }),
}));

const { ApiClientError, createApi, createResultApi } = await import("./base");

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createResultApi", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    renewSession.mockReset();
    queueRequest.mockReset().mockResolvedValue(undefined);
  });

  it("resolves ok(data) on a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { hello: "world" })),
    );

    const result = await createResultApi("notebook-crud").get("/ping");

    expect(result.isOk()).toBe(true);
    expect(result.data).toEqual({ hello: "world" });
  });

  it("resolves err(ApiClientError) with code/message/details on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(409, {
          code: "UNIQUE_VIOLATION",
          message: "já existe",
          details: { field: "slug" },
        }),
      ),
    );

    const result = await createResultApi("notebook-crud").get("/notebooks");

    expect(result.isErr()).toBe(true);
    expect(result.error).toBeInstanceOf(ApiClientError);
    const error = result.error as InstanceType<typeof ApiClientError>;
    expect(error.code).toBe("UNIQUE_VIOLATION");
    expect(error.message).toBe("já existe");
    expect(error.details).toEqual({ field: "slug" });
  });

  it("retries once after a successful session renewal on 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, { renewed: true }));
    vi.stubGlobal("fetch", fetchMock);
    renewSession.mockResolvedValue("new-token");

    const result = await createResultApi("notebook-crud").get("/me");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.isOk()).toBe(true);
    expect(result.data).toEqual({ renewed: true });
  });

  it("queues the request and propagates the raw error on a network failure for a non-GET method", async () => {
    const networkError = new TypeError("Failed to fetch");
    vi.stubGlobal("window", {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(networkError));

    const result = await createResultApi("notebook-crud").post("/notebooks", {
      title: "x",
    });

    expect(queueRequest).toHaveBeenCalledTimes(1);
    expect(result.isErr()).toBe(true);
    expect(result.error).toBe(networkError);
  });
});

describe("createApi (throwing facade)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    renewSession.mockReset();
    queueRequest.mockReset().mockResolvedValue(undefined);
  });

  it("still throws ApiClientError on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(404, { code: "NOT_FOUND", message: "sem notebook" }),
        ),
    );

    await expect(
      createApi("notebook-crud").get("/notebooks/x"),
    ).rejects.toBeInstanceOf(ApiClientError);
  });

  it("still resolves the data on a successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { ok: true })),
    );

    await expect(createApi("notebook-crud").get("/ping")).resolves.toEqual({
      ok: true,
    });
  });
});

import { renewSession } from "@/lib/api/session";
import { queueRequest } from "@/lib/background-sync";
import { type Capability, resolve } from "@/lib/runtime/router";

interface FetchOptions extends RequestInit {
  headers?: Record<string, string>;
  capability?: Capability;
}

export class ApiClientError extends Error {
  code: string;
  details: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.details = details;
  }
}

// Routes belonging to the session cycle itself: renewing on top of a 401 from them would loop.
const SESSION_ROUTES = [
  "/user/login",
  "/user/register",
  "/user/refresh",
  "/user/logout",
];

async function http<T>(
  path: string,
  capability: Capability,
  config?: FetchOptions,
  alreadyRenewed = false,
): Promise<T> {
  const { capability: override, ...rest } = config ?? {};
  const target = resolve(override ?? capability);
  const url = `${target.baseUrl}${path}`;

  const init: RequestInit = {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(target.token && { Authorization: `Bearer ${target.token}` }),
      ...rest.headers,
    },
  };

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    const method = (init.method ?? "GET").toUpperCase();
    if (
      typeof window !== "undefined" &&
      err instanceof TypeError &&
      method !== "GET"
    ) {
      await queueRequest(url, init).catch(() => {});
    }
    throw err;
  }

  if (
    response.status === 401 &&
    !alreadyRenewed &&
    !SESSION_ROUTES.some((route) => path.startsWith(route))
  ) {
    const newToken = await renewSession();

    if (newToken) {
      return http<T>(path, capability, config, true);
    }
  }

  if (!response.ok) {
    const errorBody: unknown = await response.json().catch(() => ({}));
    const body =
      typeof errorBody === "object" && errorBody !== null
        ? (errorBody as Record<string, unknown>)
        : {};
    const code = typeof body.code === "string" ? body.code : "UNKNOWN_ERROR";
    const details =
      typeof body.details === "object" && body.details !== null
        ? (body.details as Record<string, unknown>)
        : {};
    const errorMessage =
      (typeof body.message === "string" && body.message) ||
      (typeof body.error === "string" && body.error) ||
      "Erro na requisição";

    throw new ApiClientError(errorMessage, code, details);
  }

  const text = await response.text();

  return text ? JSON.parse(text) : (null as unknown as T);
}

export function createApi(capability: Capability) {
  return {
    get: <T>(path: string, config?: FetchOptions) =>
      http<T>(path, capability, { ...config, method: "GET" }),

    post: <T>(path: string, body?: unknown, config?: FetchOptions) =>
      http<T>(path, capability, {
        ...config,
        method: "POST",
        body: JSON.stringify(body),
      }),

    put: <T>(path: string, body: unknown, config?: FetchOptions) =>
      http<T>(path, capability, {
        ...config,
        method: "PUT",
        body: JSON.stringify(body),
      }),

    delete: <T>(path: string, config?: FetchOptions) =>
      http<T>(path, capability, { ...config, method: "DELETE" }),

    patch: <T>(path: string, body?: unknown, config?: FetchOptions) =>
      http<T>(path, capability, {
        ...config,
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  };
}

import {
  type AsyncResult,
  catchError,
  catchErrorSync,
  err,
  ok,
} from "@catcherjs/core";
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

async function httpResult<T>(
  path: string,
  capability: Capability,
  config?: FetchOptions,
  alreadyRenewed = false,
): AsyncResult<T, ApiClientError | Error> {
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

  const fetchResult = await catchError(fetch(url, init));

  if (fetchResult.isErr()) {
    const method = (init.method ?? "GET").toUpperCase();
    if (
      typeof window !== "undefined" &&
      fetchResult.error instanceof TypeError &&
      method !== "GET"
    ) {
      await queueRequest(url, init).catch(() => {});
    }
    return err(fetchResult.error);
  }

  const response = fetchResult.data;

  if (
    response.status === 401 &&
    !alreadyRenewed &&
    !SESSION_ROUTES.some((route) => path.startsWith(route))
  ) {
    const newToken = await renewSession();

    if (newToken) {
      return httpResult<T>(path, capability, config, true);
    }
  }

  if (!response.ok) {
    const bodyResult = await catchError(response.json());
    const errorBody: unknown = bodyResult.getOrElse({});
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

    return err(new ApiClientError(errorMessage, code, details));
  }

  const textResult = await catchError(response.text());
  if (textResult.isErr()) return err(textResult.error);

  const text = textResult.data;
  if (!text) return ok(null as unknown as T);

  const parseResult = catchErrorSync(() => JSON.parse(text));
  if (parseResult.isErr()) return err(parseResult.error);

  return ok(parseResult.data as T);
}

export function createResultApi(capability: Capability) {
  return {
    get: <T>(path: string, config?: FetchOptions) =>
      httpResult<T>(path, capability, { ...config, method: "GET" }),

    post: <T>(path: string, body?: unknown, config?: FetchOptions) =>
      httpResult<T>(path, capability, {
        ...config,
        method: "POST",
        body: JSON.stringify(body),
      }),

    put: <T>(path: string, body: unknown, config?: FetchOptions) =>
      httpResult<T>(path, capability, {
        ...config,
        method: "PUT",
        body: JSON.stringify(body),
      }),

    delete: <T>(path: string, config?: FetchOptions) =>
      httpResult<T>(path, capability, { ...config, method: "DELETE" }),

    patch: <T>(path: string, body?: unknown, config?: FetchOptions) =>
      httpResult<T>(path, capability, {
        ...config,
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  };
}

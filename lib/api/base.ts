import { queueRequest } from "@/lib/backgroundSync";
import { type Capability, resolve } from "@/lib/runtime/router";

export const BASE_URL =
  process.env.NEXT_PUBLIC_API || "http://localhost:3099/api";

interface FetchOptions extends RequestInit {
  headers?: Record<string, string>;
  capability?: Capability;
}

export class ApiClientError extends Error {
  code: string;
  details: Record<string, any>;

  constructor(
    message: string,
    code: string,
    details: Record<string, any> = {},
  ) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.details = details;
  }
}

async function http<T>(path: string, config?: FetchOptions): Promise<T> {
  const { capability, ...rest } = config ?? {};
  const target = resolve(capability);
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

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const code = errorBody.code || "UNKNOWN_ERROR";
    const details = errorBody.details || {};
    const errorMessage =
      errorBody.message || errorBody.error || "Erro na requisição";

    throw new ApiClientError(errorMessage, code, details);
  }

  const text = await response.text();

  return text ? JSON.parse(text) : (null as unknown as T);
}

export function createApi(capability?: Capability) {
  const withCapability = (config?: FetchOptions): FetchOptions => ({
    ...config,
    capability: config?.capability ?? capability,
  });

  return {
    get: <T>(path: string, config?: FetchOptions) =>
      http<T>(path, { ...withCapability(config), method: "GET" }),

    post: <T>(path: string, body?: any, config?: FetchOptions) =>
      http<T>(path, {
        ...withCapability(config),
        method: "POST",
        body: JSON.stringify(body),
      }),

    put: <T>(path: string, body: any, config?: FetchOptions) =>
      http<T>(path, {
        ...withCapability(config),
        method: "PUT",
        body: JSON.stringify(body),
      }),

    delete: <T>(path: string, config?: FetchOptions) =>
      http<T>(path, { ...withCapability(config), method: "DELETE" }),

    patch: <T>(path: string, body?: any, config?: FetchOptions) =>
      http<T>(path, {
        ...withCapability(config),
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  };
}

export const api = createApi();

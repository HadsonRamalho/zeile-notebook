import { queueRequest } from "@/lib/backgroundSync";
import { renovarSessao } from "@/lib/api/session";
import { type Capability, resolve } from "@/lib/runtime/router";

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

// Rotas do próprio ciclo de sessão: renovar em cima de um 401 delas geraria laço.
const ROTAS_DE_SESSAO = ["/user/login", "/user/register", "/user/refresh", "/user/logout"];

async function http<T>(
  path: string,
  capability: Capability,
  config?: FetchOptions,
  jaRenovou = false,
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
    !jaRenovou &&
    !ROTAS_DE_SESSAO.some((rota) => path.startsWith(rota))
  ) {
    const novoToken = await renovarSessao();

    if (novoToken) {
      return http<T>(path, capability, config, true);
    }
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

export function createApi(capability: Capability) {
  return {
    get: <T>(path: string, config?: FetchOptions) =>
      http<T>(path, capability, { ...config, method: "GET" }),

    post: <T>(path: string, body?: any, config?: FetchOptions) =>
      http<T>(path, capability, {
        ...config,
        method: "POST",
        body: JSON.stringify(body),
      }),

    put: <T>(path: string, body: any, config?: FetchOptions) =>
      http<T>(path, capability, {
        ...config,
        method: "PUT",
        body: JSON.stringify(body),
      }),

    delete: <T>(path: string, config?: FetchOptions) =>
      http<T>(path, capability, { ...config, method: "DELETE" }),

    patch: <T>(path: string, body?: any, config?: FetchOptions) =>
      http<T>(path, capability, {
        ...config,
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  };
}

import { getCookie } from "cookies-next";

export const BASE_URL =
  process.env.NEXT_PUBLIC_API || "https://4n4vf0vd-3099.brs.devtunnels.ms/api";

interface FetchOptions extends RequestInit {
  headers?: Record<string, string>;
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
  const url = `${BASE_URL}${path}`;
  const token = getCookie("auth_token");

  const init: RequestInit = {
    ...config,
    headers: {
      "Content-Type": "application/json",
      "X-Tunnel-Skip-AntiPhish": "true",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...config?.headers,
    },
  };

  const response = await fetch(url, init);

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

export const api = {
  get: <T>(path: string, config?: FetchOptions) =>
    http<T>(path, { ...config, method: "GET" }),

  post: <T>(path: string, body?: any, config?: FetchOptions) =>
    http<T>(path, { ...config, method: "POST", body: JSON.stringify(body) }),

  put: <T>(path: string, body: any, config?: FetchOptions) =>
    http<T>(path, { ...config, method: "PUT", body: JSON.stringify(body) }),

  delete: <T>(path: string, config?: FetchOptions) =>
    http<T>(path, { ...config, method: "DELETE" }),

  patch: <T>(path: string, body?: any, config?: FetchOptions) =>
    http<T>(path, { ...config, method: "PATCH", body: JSON.stringify(body) }),
};

import { getCookie } from "cookies-next";
import { queueRequest } from "@/lib/backgroundSync";

export const BASE_URL =
  process.env.NEXT_PUBLIC_API || "http://localhost:3099/api";

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
      ...(token && { Authorization: `Bearer ${token}` }),
      ...config?.headers,
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

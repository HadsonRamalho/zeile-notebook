import { getCookie, setCookie } from "cookies-next";

export const CAPABILITIES = [
  "auth",
  "user",
  "notebook-crud",
  "folders",
  "snapshots",
  "comments",
  "activity",
  "sync",
  "exec-compiled",
  "challenges",
  "grants",
  "teams",
  "chat",
  "templates",
  "public",
  "push",
  "notifications",
  "admin",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type TargetKind = "remote" | "local";
export type AccountType = "cloud" | "local";

export interface Target {
  kind: TargetKind;
  baseUrl: string;
  wsHost: string;
  wsSecure: boolean;
  token: string;
}

const REMOTE_BASE_URL =
  process.env.NEXT_PUBLIC_API || "http://localhost:3099/api";
const REMOTE_WS_HOST =
  process.env.NEXT_PUBLIC_WS_URL?.replace(/^https?:\/\//, "") || "";
const REMOTE_WS_SECURE =
  process.env.NEXT_PUBLIC_WS_URL?.startsWith("https://") ?? false;

const LOCAL_BASE_URL =
  process.env.NEXT_PUBLIC_LOCAL_API || "http://127.0.0.1:3099/api";
const LOCAL_WS_HOST =
  process.env.NEXT_PUBLIC_LOCAL_WS?.replace(/^https?:\/\//, "") ||
  "127.0.0.1:3099";

const ACCOUNT_COOKIE = "zeile_account";
const REMOTE_TOKEN_COOKIE = "auth_token";
const LOCAL_TOKEN_COOKIE = "local_auth_token";
const REMOTE_REFRESH_COOKIE = "refresh_token";
const LOCAL_REFRESH_COOKIE = "local_refresh_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
export const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const LOCAL_CAPABILITIES: ReadonlySet<Capability> = new Set([
  "auth",
  "user",
  "notebook-crud",
  "folders",
  "snapshots",
  "comments",
  "activity",
  "sync",
  "exec-compiled",
  "challenges",
  "grants",
]);

const CLOUD_ONLY_CAPABILITIES: ReadonlySet<Capability> = new Set([
  "teams",
  "chat",
  "templates",
  "public",
  "push",
  "notifications",
  "admin",
]);

export function isDesktopRuntime(): boolean {
  if (process.env.NEXT_PUBLIC_RUNTIME === "desktop") return true;
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  };
  return w.__TAURI_INTERNALS__ !== undefined || w.__TAURI__ !== undefined;
}

export function getActiveAccount(): AccountType {
  return (getCookie(ACCOUNT_COOKIE) as string | undefined) === "local"
    ? "local"
    : "cloud";
}

export function setActiveAccount(account: AccountType) {
  setCookie(ACCOUNT_COOKIE, account, { maxAge: COOKIE_MAX_AGE });
}

export function tokenCookieName(account: AccountType = getActiveAccount()) {
  return account === "local" ? LOCAL_TOKEN_COOKIE : REMOTE_TOKEN_COOKIE;
}

export function refreshCookieName(account: AccountType = getActiveAccount()) {
  return account === "local" ? LOCAL_REFRESH_COOKIE : REMOTE_REFRESH_COOKIE;
}

function isOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function isCapabilityAvailable(
  capability: Capability,
  online: boolean = isOnline(),
): boolean {
  if (CLOUD_ONLY_CAPABILITIES.has(capability)) {
    return getActiveAccount() === "cloud" && online;
  }
  return true;
}

function tokenFor(kind: TargetKind): string {
  const key = kind === "local" ? LOCAL_TOKEN_COOKIE : REMOTE_TOKEN_COOKIE;
  return (getCookie(key) as string | undefined) ?? "";
}

export function resolve(
  capability: Capability,
  account: AccountType = getActiveAccount(),
): Target {
  const useLocal =
    isDesktopRuntime() &&
    account === "local" &&
    LOCAL_CAPABILITIES.has(capability);

  if (useLocal) {
    return {
      kind: "local",
      baseUrl: LOCAL_BASE_URL,
      wsHost: LOCAL_WS_HOST,
      wsSecure: false,
      token: tokenFor("local"),
    };
  }

  return {
    kind: "remote",
    baseUrl: REMOTE_BASE_URL,
    wsHost: REMOTE_WS_HOST,
    wsSecure: REMOTE_WS_SECURE,
    token: tokenFor("remote"),
  };
}

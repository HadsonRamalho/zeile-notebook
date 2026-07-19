import { getCookie, setCookie } from "cookies-next";

export type Capability =
  | "auth"
  | "user"
  | "notebook-crud"
  | "folders"
  | "snapshots"
  | "comments"
  | "activity"
  | "sync"
  | "exec-compiled"
  | "challenges"
  | "grants"
  | "teams"
  | "chat"
  | "templates"
  | "public"
  | "push"
  | "notifications"
  | "admin";

export type TargetKind = "remote" | "local";
export type AccountType = "cloud" | "local";

export interface Target {
  kind: TargetKind;
  baseUrl: string;
  wsHost: string;
  token: string;
}

const REMOTE_BASE_URL =
  process.env.NEXT_PUBLIC_API || "http://localhost:3099/api";
const REMOTE_WS_HOST =
  process.env.NEXT_PUBLIC_WS_URL?.replace(/^https?:\/\//, "") || "";

const LOCAL_BASE_URL =
  process.env.NEXT_PUBLIC_LOCAL_API || "http://127.0.0.1:3099/api";
const LOCAL_WS_HOST =
  process.env.NEXT_PUBLIC_LOCAL_WS?.replace(/^https?:\/\//, "") ||
  "127.0.0.1:3099";

const ACCOUNT_COOKIE = "zeile_account";
const REMOTE_TOKEN_COOKIE = "auth_token";
const LOCAL_TOKEN_COOKIE = "local_auth_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

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
  return (
    typeof window !== "undefined" &&
    (window as unknown as { __TAURI__?: unknown }).__TAURI__ !== undefined
  );
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

export function resolve(capability?: Capability): Target {
  const useLocal =
    isDesktopRuntime() &&
    getActiveAccount() === "local" &&
    capability !== undefined &&
    LOCAL_CAPABILITIES.has(capability);

  if (useLocal) {
    return {
      kind: "local",
      baseUrl: LOCAL_BASE_URL,
      wsHost: LOCAL_WS_HOST,
      token: tokenFor("local"),
    };
  }

  return {
    kind: "remote",
    baseUrl: REMOTE_BASE_URL,
    wsHost: REMOTE_WS_HOST,
    token: tokenFor("remote"),
  };
}

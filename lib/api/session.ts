import { deleteCookie, getCookie, setCookie } from "cookies-next";
import {
  type AccountType,
  getActiveAccount,
  REFRESH_COOKIE_MAX_AGE,
  refreshCookieName,
  resolve,
  tokenCookieName,
} from "@/lib/runtime/router";

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresInSecs: number;
}

/// Margin to renew before expiry: the access token cookie expires a bit
/// before the token itself, so the client never gets to send an expired token.
const MARGIN_SECS = 30;

export function storeSession(
  session: Session,
  account: AccountType = getActiveAccount(),
) {
  const maxAge = Math.max(session.expiresInSecs - MARGIN_SECS, 60);

  setCookie(tokenCookieName(account), session.accessToken, { maxAge });
  setCookie(refreshCookieName(account), session.refreshToken, {
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
}

export function clearSession(account: AccountType = getActiveAccount()) {
  deleteCookie(tokenCookieName(account));
  deleteCookie(refreshCookieName(account));
}

export function storedRefreshToken(
  account: AccountType = getActiveAccount(),
): string | undefined {
  return getCookie(refreshCookieName(account)) as string | undefined;
}

// One renewal at a time. Without this, a burst of expired requests would
// renew in parallel: the first rotation invalidates the others' refresh, the
// server reads that as reuse of a leaked token, and drops all of the user's sessions.
let renewalInProgress: Promise<string | null> | null = null;

export function renewSession(
  account: AccountType = getActiveAccount(),
): Promise<string | null> {
  renewalInProgress ??= performRenewal(account).finally(() => {
    renewalInProgress = null;
  });

  return renewalInProgress;
}

async function performRenewal(account: AccountType): Promise<string | null> {
  const refreshToken = storedRefreshToken(account);

  if (!refreshToken) {
    return null;
  }

  const target = resolve("auth", account);

  try {
    const response = await fetch(`${target.baseUrl}/user/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      clearSession(account);
      return null;
    }

    const session: Session = await response.json();
    storeSession(session, account);

    return session.accessToken;
  } catch {
    // A network failure is not an invalid session: keeping the refresh
    // allows retrying once the connection comes back.
    return null;
  }
}

export async function endSessionOnServer(
  account: AccountType = getActiveAccount(),
) {
  const refreshToken = storedRefreshToken(account);

  if (!refreshToken) {
    return;
  }

  const target = resolve("auth", account);

  try {
    await fetch(`${target.baseUrl}/user/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Local logout happens either way.
  }
}

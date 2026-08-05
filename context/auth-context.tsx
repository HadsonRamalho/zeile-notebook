"use client";

import { getCookie } from "cookies-next";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { createApi } from "@/lib/api/base";
import { handleApiError } from "@/lib/api/handle-api-error";
import {
  clearSession,
  endSessionOnServer,
  type Session,
  storeSession,
} from "@/lib/api/session";
import { deleteAccount } from "@/lib/api/user-service";
import {
  type AccountType,
  getActiveAccount,
  setActiveAccount,
  tokenCookieName,
} from "@/lib/runtime/router";
import type { LoginUser, RegisterUser, User } from "@/lib/types/user-types";

const authApi = createApi("auth");

interface AuthContextType {
  user: User | null;
  account: AccountType;
  githubSignIn: (token: string, refreshToken?: string) => void;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (data: LoginUser, account?: AccountType) => Promise<void>;
  signOut: () => Promise<void>;
  register: (data: RegisterUser, account?: AccountType) => Promise<void>;
  deleteProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const t = useTranslations("api_errors");
  const [user, setUser] = useState<User | null>(null);
  const [account, setAccount] = useState<AccountType>("cloud");
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function loadUserFromSession() {
      const current = getActiveAccount();
      setAccount(current);
      const token = getCookie(tokenCookieName(current));

      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const profile = await authApi.get<User>("/user/me");
        setUser(profile);
      } catch (err) {
        handleApiError({ err, t });
        signOut();
      } finally {
        setIsLoading(false);
      }
    }

    loadUserFromSession();
  }, []);

  const githubSignIn = async (token: string, refreshToken?: string) => {
    setActiveAccount("cloud");
    setAccount("cloud");

    storeSession(
      {
        accessToken: token,
        refreshToken: refreshToken ?? "",
        expiresInSecs: 15 * 60,
      },
      "cloud",
    );

    const profile = await authApi.get<User>("/user/me");

    setUser(profile);
    router.push("/notebook");
    router.refresh();
  };

  const signIn = async (data: LoginUser, target: AccountType = account) => {
    setActiveAccount(target);
    setAccount(target);

    const session = await authApi.post<Session>("/user/login", data);

    storeSession(session, target);

    const profile = await authApi.get<User>("/user/me");

    setUser(profile);
    router.push("/notebook");
    router.refresh();
  };

  const register = async (
    data: RegisterUser,
    target: AccountType = account,
  ) => {
    setActiveAccount(target);
    setAccount(target);

    const session = await authApi.post<Session>("/user/register", {
      ...data,
      primaryProvider: "Email",
    });

    storeSession(session, target);

    const profile = await authApi.get<User>("/user/me");

    setUser(profile);
    router.push("/notebook");
    router.refresh();
  };

  const deleteProfile = async () => {
    await deleteAccount();

    clearSession(account);
    setUser(null);
    router.push("/");
  };

  const signOut = async () => {
    // Revoke on the server before forgetting locally: without this the refresh
    // token would stay valid for thirty days for anyone holding a copy of it.
    await endSessionOnServer(account);

    clearSession(account);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        deleteProfile,
        githubSignIn,
        user,
        account,
        isLoading,
        register,
        isAuthenticated: !!user,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

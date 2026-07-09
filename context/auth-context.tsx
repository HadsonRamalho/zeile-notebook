"use client";

import { deleteCookie, getCookie, setCookie } from "cookies-next";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api/base";
import { handleApiError } from "@/lib/api/handle-api-error";
import { deleteAccount } from "@/lib/api/user-service";
import type { LoginUser, RegisterUser, User } from "@/lib/types/user-types";

interface AuthContextType {
  user: User | null;
  githubSignIn: (token: string) => void;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (data: LoginUser) => Promise<void>;
  signOut: () => void;
  register: (data: RegisterUser) => Promise<void>;
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
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function loadUserFromSession() {
      const token = getCookie("auth_token");

      if (!token) {
        console.log("Token não encontrado nos cookies");
        setIsLoading(false);
        return;
      }

      try {
        const profile = await api.get<User>("/user/me");
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

  const githubSignIn = async (token: string) => {
    try {
      setCookie("auth_token", token, { maxAge: 60 * 60 * 24 * 7 });

      const profile = await api.get<User>("/user/me");

      setUser(profile);
      router.push("/notebook");
      router.refresh();
    } catch (error) {
      throw error;
    }
  };

  const signIn = async (data: LoginUser) => {
    try {
      const token = await api.post<string>("/user/login", data);

      setCookie("auth_token", token, { maxAge: 60 * 60 * 24 * 7 });

      const profile = await api.get<User>("/user/me");

      setUser(profile);
      router.push("/notebook");
      router.refresh();
    } catch (error) {
      throw error;
    }
  };

  const register = async (data: RegisterUser) => {
    try {
      const token = await api.post<string>("/user/register", {
        ...data,
        primary_provider: "Email",
      });

      setCookie("auth_token", token, { maxAge: 60 * 60 * 24 * 7 });

      const profile = await api.get<User>("/user/me");

      setUser(profile);
      router.push("/notebook");
      router.refresh();
    } catch (error) {
      throw error;
    }
  };

  const deleteProfile = async () => {
    try {
      await deleteAccount();

      deleteCookie("auth_token");
      setUser(null);
      router.push("/");
    } catch (error) {
      throw error;
    }
  };

  const signOut = () => {
    deleteCookie("auth_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        deleteProfile,
        githubSignIn,
        user,
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
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return context;
}

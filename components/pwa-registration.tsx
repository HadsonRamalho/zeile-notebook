"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { isDesktopRuntime } from "@/lib/runtime/router";

export function PWARegistration() {
  const isOnline = useOnlineStatus();
  const hasMounted = useRef(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      isDesktopRuntime()
    ) {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Falha ao registrar Service Worker:", err);
    });

    let reloaded = false;
    const handleControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );
    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
    };
  }, []);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    if (isOnline) {
      toast.success("Conexão restabelecida.");
    } else {
      toast.warning("Você está offline. Algumas ações podem não funcionar.");
    }
  }, [isOnline]);

  return null;
}

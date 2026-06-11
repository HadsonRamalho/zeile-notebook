"use client";

import { useEffect } from "react";

export function PWARegistration() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("Service Worker registrado com sucesso:", reg.scope);
        })
        .catch((err) => {
          console.error("Falha ao registrar Service Worker:", err);
        });
    }
  }, []);

  return null;
}

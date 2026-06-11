import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkFirst, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (string | PrecacheEntry)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher({ request }) {
        return request.mode === "navigate";
      },
      handler: new NetworkFirst({
        cacheName: "navigations",
      }),
    },
    {
      matcher({ url }) {
        return (
          url.pathname.includes("/docs") ||
          url.pathname.includes("/profile") ||
          url.pathname.includes("/explore") ||
          url.pathname.includes("/settings")
        );
      },
      handler: new NetworkFirst({
        cacheName: "pages-runtime",
      }),
    },
    {
      matcher({ request }) {
        return (
          request.destination === "style" ||
          request.destination === "script" ||
          request.destination === "worker"
        );
      },
      handler: new StaleWhileRevalidate({
        cacheName: "assets-runtime",
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();

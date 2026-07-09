import { defaultCache } from "@serwist/next/worker";
import type {
  PrecacheEntry,
  SerwistGlobalConfig,
  SerwistPlugin,
} from "serwist";
import { NetworkFirst, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (string | PrecacheEntry)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const OFFLINE_URL = "/offline.html";

const offlineFallbackPlugin: SerwistPlugin = {
  handlerDidError: async () => {
    const cached = await caches.match(OFFLINE_URL);
    return cached ?? Response.error();
  },
};

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
        plugins: [offlineFallbackPlugin],
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
        plugins: [offlineFallbackPlugin],
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

import { defaultCache } from "@serwist/next/worker";
import type {
  PrecacheEntry,
  SerwistGlobalConfig,
  SerwistPlugin,
} from "serwist";
import { NetworkFirst, Serwist, StaleWhileRevalidate } from "serwist";
import {
  BACKGROUND_SYNC_TAG,
  getQueuedRequests,
  removeQueuedRequest,
} from "@/lib/backgroundSync";

declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (string | PrecacheEntry)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

async function retryQueuedRequests() {
  const queued = await getQueuedRequests();
  for (const req of queued) {
    try {
      const response = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body ?? undefined,
      });
      if (response.ok) await removeQueuedRequest(req.id);
    } catch {}
  }
}

(self as unknown as EventTarget).addEventListener("sync", (event: Event) => {
  const syncEvent = event as unknown as {
    tag: string;
    waitUntil: (p: Promise<void>) => void;
  };
  if (syncEvent.tag === BACKGROUND_SYNC_TAG) {
    syncEvent.waitUntil(retryQueuedRequests());
  }
});

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

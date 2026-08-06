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
} from "@/lib/background-sync";

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
        body: req.body ?? null,
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

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
}

interface NotificationClient {
  url: string;
  focus: () => Promise<NotificationClient>;
}

interface PushCapableScope {
  registration: {
    showNotification: (
      title: string,
      options: {
        body?: string;
        icon?: string;
        badge?: string;
        data?: { url: string };
      },
    ) => Promise<void>;
  };
  clients: {
    matchAll: (options: { type: string }) => Promise<NotificationClient[]>;
    openWindow: (url: string) => Promise<NotificationClient | null>;
  };
}

const pushSelf = self as unknown as PushCapableScope;

(self as unknown as EventTarget).addEventListener("push", (event: Event) => {
  const pushEvent = event as unknown as {
    data?: { json: () => PushPayload };
    waitUntil: (p: Promise<void>) => void;
  };

  const payload = pushEvent.data?.json() ?? {};
  const title = payload.title ?? "Zeile Notebook";

  pushEvent.waitUntil(
    pushSelf.registration.showNotification(title, {
      ...(payload.body !== undefined ? { body: payload.body } : {}),
      icon: "/icon-128.png",
      badge: "/icon-128.png",
      data: { url: payload.url ?? "/" },
    }),
  );
});

(self as unknown as EventTarget).addEventListener(
  "notificationclick",
  (event: Event) => {
    const clickEvent = event as unknown as {
      notification: { close: () => void; data?: { url?: string } };
      waitUntil: (p: Promise<void>) => void;
    };

    clickEvent.notification.close();
    const url = clickEvent.notification.data?.url ?? "/";

    clickEvent.waitUntil(
      pushSelf.clients.matchAll({ type: "window" }).then((clients) => {
        const existing = clients.find((client) => client.url.includes(url));
        if (existing) {
          return existing.focus().then(() => undefined);
        }
        return pushSelf.clients.openWindow(url).then(() => undefined);
      }),
    );
  },
);

const OFFLINE_URL = "/offline.html";

const offlineFallbackPlugin: SerwistPlugin = {
  handlerDidError: async () => {
    const cached = await caches.match(OFFLINE_URL);
    return cached ?? Response.error();
  },
};

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
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

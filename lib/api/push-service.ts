import { createApi } from "./base";

const api = createApi("push");

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export async function subscribeToPush(payload: PushSubscriptionPayload) {
  return api.post<void>("/notebook/push/subscribe", payload);
}

export async function unsubscribeFromPush(endpoint: string) {
  return api.delete<void>("/notebook/push/subscribe", {
    body: JSON.stringify({ endpoint }),
  });
}

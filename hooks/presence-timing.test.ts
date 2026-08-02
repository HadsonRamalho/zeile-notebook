import { describe, expect, it } from "vitest";
import {
  CURSOR_THROTTLE_MS,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_PRUNE_INTERVAL_MS,
  PRESENCE_STALE_MS,
  isStale,
  shouldSendCursor,
} from "./presence-timing";

describe("shouldSendCursor", () => {
  it("bloqueia envio antes do intervalo de throttle", () => {
    expect(shouldSendCursor(1000, 1000)).toBe(false);
    expect(shouldSendCursor(1000 + CURSOR_THROTTLE_MS - 1, 1000)).toBe(false);
  });

  it("libera envio ao completar o intervalo", () => {
    expect(shouldSendCursor(1000 + CURSOR_THROTTLE_MS, 1000)).toBe(true);
    expect(shouldSendCursor(1000 + CURSOR_THROTTLE_MS * 5, 1000)).toBe(true);
  });

  it("libera o primeiro envio da sessao", () => {
    expect(shouldSendCursor(Date.now(), 0)).toBe(true);
  });
});

describe("isStale", () => {
  it("mantem quem bateu ponto dentro da janela", () => {
    expect(isStale(1000, 1000)).toBe(false);
    expect(isStale(1000 + PRESENCE_STALE_MS, 1000)).toBe(false);
  });

  it("expira quem passou da janela", () => {
    expect(isStale(1000 + PRESENCE_STALE_MS + 1, 1000)).toBe(true);
  });
});

describe("invariantes de timing da presenca", () => {
  it("sobrevive a heartbeats perdidos antes de expirar um cliente vivo", () => {
    expect(PRESENCE_STALE_MS).toBeGreaterThanOrEqual(PRESENCE_HEARTBEAT_MS * 2);
  });

  it("varre com frequencia maior que a janela de expiracao", () => {
    expect(PRESENCE_PRUNE_INTERVAL_MS).toBeLessThan(PRESENCE_STALE_MS);
  });

  it("nao envia cursor mais rapido que o flush do servidor", () => {
    expect(CURSOR_THROTTLE_MS).toBeGreaterThanOrEqual(50);
  });
});

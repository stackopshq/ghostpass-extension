// Client HTTP vers le backend GhostPass. Contrairement à la web app (proxy Vite `/api`),
// l'extension doit cibler l'URL complète du backend (voir host_permissions du manifest).
// L'URL est configurable depuis la page d'options (browser.storage) ; défaut = backend de dev local.
import { browser } from "./browser.js";

const DEFAULT_API_BASE = "http://localhost:3000";

let apiBase = DEFAULT_API_BASE;

export async function loadApiBase(): Promise<void> {
  try {
    const { apiBase: stored } = await browser.storage.local.get("apiBase");
    if (typeof stored === "string" && stored) apiBase = stored;
  } catch {
    /* hors contexte extension (ex. tests) → défaut */
  }
}

export async function setApiBase(url: string): Promise<void> {
  apiBase = url.replace(/\/$/, "");
  try {
    await browser.storage.local.set({ apiBase });
  } catch {
    /* ignore */
  }
}

export function getApiBase(): string {
  return apiBase;
}

export interface ItemDto {
  id: string;
  encryptedKey: string;
  encryptedData: string;
}

async function http<T>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;
  const res = await fetch(`${apiBase}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* corps non JSON */
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  prelogin(email: string) {
    return http<{ kdfParams: string }>("/api/auth/prelogin", { method: "POST", body: { email } });
  },
  async login(email: string, masterPasswordHash: string, totpCode?: string) {
    const res = await fetch(`${apiBase}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, masterPasswordHash, totpCode }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok)
      return {
        ok: true as const,
        token: data.token as string,
        kdfParams: data.kdfParams as string,
        encryptedUserKey: data.encryptedUserKey as string,
        encryptedPrivateKey: data.encryptedPrivateKey as string,
      };
    return {
      ok: false as const,
      mfaRequired: data.mfaRequired === true,
      error: typeof data.error === "string" ? data.error : `HTTP ${res.status}`,
    };
  },
  listItems(token: string) {
    return http<{ items: ItemDto[] }>("/api/vault/items", { token });
  },
};

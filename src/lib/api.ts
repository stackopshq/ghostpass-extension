// Client HTTP vers le backend GhostPass. Contrairement à la web app (proxy Vite `/api`),
// l'extension doit cibler l'URL complète du backend. L'URL est configurable depuis la page
// d'options (browser.storage).
//
// **Il n'y a pas de backend par défaut dans un build publié.** Le manifeste ne demande la
// permission d'accéder à `http://localhost:3000` qu'en mode développement ; un paquet du Store
// qui garderait ce défaut échouerait sur une erreur réseau opaque au premier déverrouillage,
// là où l'utilisateur doit lire « configurez votre instance ».
//
// Le discriminant est le **mode Vite**, exactement celui sur lequel `manifest.config.ts` branche
// `host_permissions` — deux tests différents finiraient par ne plus dire la même chose. Ce n'est
// PAS `import.meta.env.DEV`, qui reste faux sous `vite build --mode development` : le défaut du
// code et la permission du manifeste divergeraient alors en silence.
import { browser } from "./browser.js";

const DEFAULT_API_BASE = import.meta.env.MODE === "production" ? "" : "http://localhost:3000";

const NO_BACKEND =
  "Aucune instance GhostPass configurée. Ouvrez les options de l'extension (icône ⚙) et saisissez l'URL de votre serveur.";

let apiBase = DEFAULT_API_BASE;

function requireBase(): string {
  if (!apiBase) throw new Error(NO_BACKEND);
  return apiBase;
}

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
  const res = await fetch(`${requireBase()}${path}`, {
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
    const res = await fetch(`${requireBase()}/api/auth/login`, {
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

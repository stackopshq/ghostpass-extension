// Protocole de messages popup ↔ service worker (la session vit dans le SW).
import type { DecryptedItem } from "./crypto.js";

export type Message =
  | { type: "unlock"; email: string; password: string; totpCode?: string }
  | { type: "getState" }
  | { type: "lock" }
  | { type: "fill"; itemId: string; tabId: number };

export interface FillResult {
  ok: boolean;
  filled?: boolean;
  error?: string;
}

/** Hostname normalisé (sans `www.`) d'une URL éventuellement sans schéma. `null` si invalide. */
export function hostFromUrl(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Vrai si deux hôtes correspondent (égaux ou l'un sous-domaine de l'autre). */
export function hostsMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

export interface UnlockResult {
  ok: boolean;
  items?: DecryptedItem[];
  mfaRequired?: boolean;
  error?: string;
}

export interface StateResult {
  unlocked: boolean;
  items?: DecryptedItem[];
}

export const DEFAULT_AUTO_LOCK_MINUTES = 15;

export async function getAutoLockMinutes(): Promise<number> {
  try {
    const { autoLockMinutes } = await chrome.storage.local.get("autoLockMinutes");
    const n = Number(autoLockMinutes);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_AUTO_LOCK_MINUTES;
  } catch {
    return DEFAULT_AUTO_LOCK_MINUTES;
  }
}

// Protocole de messages popup ↔ service worker (la session vit dans le SW).
import { browser } from "./browser.js";
import type { DecryptedItem } from "./crypto.js";

export type Message =
  | { type: "unlock"; email: string; password: string; totpCode?: string }
  | { type: "getState" }
  | { type: "lock" }
  | { type: "fill"; itemId: string; tabId: number };

export interface FillResult {
  ok: boolean;
  username?: boolean;
  password?: boolean;
  error?: string;
}

export { hostFromUrl, hostsMatch } from "./site-match.js";

export interface UnlockResult {
  ok: boolean;
  items?: DecryptedItem[];
  unreadable?: number;
  mfaRequired?: boolean;
  error?: string;
}

export interface StateResult {
  unlocked: boolean;
  items?: DecryptedItem[];
  unreadable?: number;
}

export const DEFAULT_AUTO_LOCK_MINUTES = 15;

export async function getAutoLockMinutes(): Promise<number> {
  try {
    const { autoLockMinutes } = await browser.storage.local.get("autoLockMinutes");
    const n = Number(autoLockMinutes);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_AUTO_LOCK_MINUTES;
  } catch {
    return DEFAULT_AUTO_LOCK_MINUTES;
  }
}

// Protocole de messages popup ↔ service worker (la session vit dans le SW).
import type { DecryptedItem } from "./crypto.js";

export type Message =
  | { type: "unlock"; email: string; password: string; totpCode?: string }
  | { type: "getState" }
  | { type: "lock" };

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

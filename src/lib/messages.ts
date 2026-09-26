// Protocole de messages popup ↔ service worker (la session vit dans le SW).
import { browser } from "./browser.js";
import type { DecryptedItem } from "./crypto.js";

export type Message =
  | { type: "unlock"; email: string; password: string; totpCode?: string }
  | { type: "getState" }
  | { type: "lock" }
  /** Déconnexion : efface le cache chiffré, pas seulement la session. */
  | { type: "logout" }
  | { type: "fill"; itemId: string; tabId: number }
  /** Combien d'identifiants pour cet hôte ? Rend un NOMBRE, jamais un secret.
   *
   * Posée par le script de contenu, qui tourne dans le contexte de la page. Il
   * ne doit donc rien recevoir qu'un script malveillant du site pourrait lire. */
  | { type: "countForHost"; host: string }
  /** Remplir l'onglet d'où vient le message, avec le meilleur candidat. */
  | { type: "fillActiveTab" };

export interface FillResult {
  ok: boolean;
  username?: boolean;
  password?: boolean;
  error?: string;
}

// Les règles de domaine vivent dans `hotes.ts`, qui n'importe rien et se
// laisse donc éprouver sous Node. Ré-exportées ici pour que les appelants
// existants n'aient pas à changer d'import.
export { hostFromUrl, hostsMatch, pourLHote } from "./hotes.js";

export interface UnlockResult {
  ok: boolean;
  items?: DecryptedItem[];
  mfaRequired?: boolean;
  error?: string;
  /** Vrai quand le coffre a été ouvert depuis le cache, sans toucher au réseau.
   *
   * L'écran s'en sert pour dire que les éléments peuvent dater, et proposer une
   * relève. Sans cette indication, un coffre vieux d'une semaine ressemblerait
   * à un coffre à jour. */
  depuisLeCache?: boolean;
}

export interface StateResult {
  unlocked: boolean;
  items?: DecryptedItem[];
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

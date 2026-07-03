// Service worker (Manifest V3) — porteur de la session déverrouillée.
//
// Sécurité : au déverrouillage, le SW déchiffre le coffre une fois puis **jette** le mot de
// passe maître et les clés. Il ne conserve que les items déchiffrés dans `chrome.storage.session`
// (mémoire seule, jamais sur disque, contexts de confiance uniquement, effacé à la fermeture du
// navigateur). Un `chrome.alarms` verrouille automatiquement après inactivité. Comme storage.session
// survit au teardown du SW, la session persiste (plus de re-login à chaque ouverture du popup) sans
// rien persister sur disque ni retenir la moindre clé.
import { api, loadApiBase } from "./lib/api.js";
import { computeLoginHash, decryptItem, ensureCryptoReady, unlock, type DecryptedItem } from "./lib/crypto.js";
import {
  getAutoLockMinutes,
  type FillResult,
  type Message,
  type StateResult,
  type UnlockResult,
} from "./lib/messages.js";

const ALARM = "ghostpass-autolock";
const SESSION_KEY = "session";

interface Session {
  items: DecryptedItem[];
  expiresAt: number;
}

let session: Session | null = null;

async function readSession(): Promise<Session | null> {
  if (session) return session;
  try {
    const stored = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] as Session | undefined;
    if (stored && typeof stored.expiresAt === "number") session = stored;
  } catch {
    /* storage.session indisponible → pas de session */
  }
  return session;
}

async function lock(): Promise<void> {
  session = null;
  await chrome.alarms.clear(ALARM);
  try {
    await chrome.storage.session.remove(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

async function persist(): Promise<void> {
  try {
    if (session) await chrome.storage.session.set({ [SESSION_KEY]: session });
  } catch {
    /* ignore */
  }
}

async function armAutoLock(): Promise<void> {
  const minutes = await getAutoLockMinutes();
  const expiresAt = Date.now() + minutes * 60_000;
  if (session) session.expiresAt = expiresAt;
  await chrome.alarms.clear(ALARM);
  chrome.alarms.create(ALARM, { when: expiresAt });
}

async function doUnlock(email: string, password: string, totpCode?: string): Promise<UnlockResult> {
  await loadApiBase();
  await ensureCryptoReady();

  const { kdfParams } = await api.prelogin(email);
  const hash = computeLoginHash(email, password, kdfParams);
  const res = await api.login(email, hash, totpCode || undefined);
  if (!res.ok) return { ok: false, mfaRequired: res.mfaRequired, error: res.error };

  const account = unlock(email, password, {
    kdfParams: res.kdfParams,
    encryptedUserKey: res.encryptedUserKey,
    encryptedPrivateKey: res.encryptedPrivateKey,
  });
  const { items: dtos } = await api.listItems(res.token);
  const items = dtos.map((d) => decryptItem(account, d.id, d.encryptedKey, d.encryptedData));
  // À partir d'ici, ni `password`, ni `account` (clés), ni `res.token` ne sont conservés.

  session = { items, expiresAt: 0 };
  await armAutoLock();
  await persist();
  return { ok: true, items };
}

// Injectée dans la page (contexte isolé) au clic « Remplir ». Autonome : aucune closure.
// Cible le formulaire de connexion (champ mot de passe visible + identifiant associé) ; gère les
// pages sans mot de passe (flux « identifiant d'abord »), ignore les champs cachés/désactivés, et
// ne se laisse pas piéger par une barre de recherche.
function fillCredentialsInPage(cred: { username: string; password: string }): {
  username: boolean;
  password: boolean;
} {
  const visible = (el: HTMLInputElement) =>
    el.offsetParent !== null && !el.disabled && !el.readOnly && el.type !== "hidden";
  const setValue = (el: HTMLInputElement | null, value: string) => {
    if (!el || !value) return false;
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  const pw = [...document.querySelectorAll<HTMLInputElement>('input[type="password"]')].find(visible) ?? null;

  // Identifiant : d'abord dans le formulaire du mot de passe, sinon à l'échelle de la page.
  const scope = pw?.form
    ? [...pw.form.querySelectorAll<HTMLInputElement>("input")].filter(visible)
    : [...document.querySelectorAll<HTMLInputElement>("input")].filter(visible);
  const hint = (i: HTMLInputElement) => `${i.autocomplete} ${i.name} ${i.id}`.toLowerCase();
  let user =
    scope.find((i) => (i.autocomplete || "").toLowerCase() === "username") ??
    scope.find((i) => i.type === "email") ??
    scope.find((i) => /user|email|login|mail/.test(hint(i))) ??
    null;
  // Sinon : dernier champ texte visible précédant le mot de passe.
  if (!user && pw) {
    const before = scope.slice(0, scope.indexOf(pw));
    user = before.reverse().find((i) => ["text", "email", "tel"].includes(i.type)) ?? null;
  }
  // Page sans mot de passe (identifiant d'abord) : premier champ texte/email visible.
  if (!user && !pw) {
    user = scope.find((i) => ["text", "email", "tel"].includes(i.type)) ?? null;
  }

  return { username: setValue(user, cred.username), password: setValue(pw, cred.password) };
}

async function doFill(itemId: string, tabId: number): Promise<FillResult> {
  const s = await readSession();
  if (!s || s.expiresAt <= Date.now()) return { ok: false, error: "Coffre verrouillé." };
  const item = s.items.find((i) => i.id === itemId);
  if (!item) return { ok: false, error: "Élément introuvable." };
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: fillCredentialsInPage,
      args: [{ username: item.username, password: item.password }],
    });
    const r = injection?.result as { username: boolean; password: boolean } | undefined;
    return { ok: true, username: !!r?.username, password: !!r?.password };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function currentState(): Promise<StateResult> {
  const s = await readSession();
  if (s && s.expiresAt > Date.now()) return { unlocked: true, items: s.items };
  if (s) await lock(); // expirée
  return { unlocked: false };
}

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case "unlock":
          sendResponse(await doUnlock(message.email, message.password, message.totpCode));
          break;
        case "getState":
          sendResponse(await currentState());
          break;
        case "lock":
          await lock();
          sendResponse({ ok: true });
          break;
        case "fill":
          sendResponse(await doFill(message.itemId, message.tabId));
          break;
        default:
          sendResponse({ ok: false, error: "unknown message" });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  })();
  return true; // réponse asynchrone
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void lock();
});

// storage.session : accessible aux seuls contextes de confiance (jamais aux content scripts).
function hardenSessionStorage(): void {
  const store = chrome.storage.session as unknown as {
    setAccessLevel?: (o: { accessLevel: string }) => Promise<void>;
  };
  store.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});
}

chrome.runtime.onInstalled.addListener(hardenSessionStorage);
chrome.runtime.onStartup.addListener(hardenSessionStorage);

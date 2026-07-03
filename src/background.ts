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
import { getAutoLockMinutes, type Message, type StateResult, type UnlockResult } from "./lib/messages.js";

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

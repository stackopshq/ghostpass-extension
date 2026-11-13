// Service worker (Manifest V3) — porteur de la session déverrouillée.
//
// Sécurité : au déverrouillage, le SW déchiffre le coffre une fois puis **jette** le mot de
// passe maître et les clés. Il ne conserve que les items déchiffrés dans `browser.storage.session`
// (mémoire seule, jamais sur disque, contexts de confiance uniquement, effacé à la fermeture du
// navigateur). Un `browser.alarms` verrouille automatiquement après inactivité. Comme storage.session
// survit au teardown du SW, la session persiste (plus de re-login à chaque ouverture du popup) sans
// rien persister sur disque ni retenir la moindre clé.
import { browser } from "./lib/browser.js";
import { api, loadApiBase } from "./lib/api.js";
import {
  computeLoginHash,
  decryptOrgItem,
  decryptVaultItem,
  ensureCryptoReady,
  openOrg,
  unlock,
  type DecryptedItem,
} from "./lib/crypto.js";
import { loadTeamVaults } from "./lib/team-vaults.js";
import { hostFromUrl, shortcutAction } from "./lib/site-match.js";
import {
  CLIPBOARD_CLEAR_SECONDS,
  getAutoLockMinutes,
  type FillResult,
  type Message,
  type StateResult,
  type UnlockResult,
} from "./lib/messages.js";

const ALARM = "ghostpass-autolock";
const CLIPBOARD_ALARM = "ghostpass-clipboard";
const OFFSCREEN_URL = "src/offscreen/index.html";

// Le presse-papiers est vidé par le service worker, pas par le popup : un popup se ferme dès
// qu'on clique ailleurs, et sa minuterie meurt avec lui. Le secret copié restait alors dans le
// presse-papiers jusqu'à la copie suivante.
async function clearClipboard(): Promise<void> {
  const offscreen = (globalThis as { chrome?: typeof chrome }).chrome?.offscreen;
  if (!offscreen) {
    // Firefox : la page d'arrière-plan a un document, et `clipboardWrite` l'autorise à écrire.
    await navigator.clipboard.writeText("");
    return;
  }
  try {
    await offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [offscreen.Reason.CLIPBOARD],
      justification: "Effacer du presse-papiers le secret copié depuis GhostPass.",
    });
  } catch {
    /* déjà ouvert : on s'en sert */
  }
  try {
    await browser.runtime.sendMessage({ target: "offscreen", type: "clearClipboard" });
  } finally {
    await offscreen.closeDocument().catch(() => {});
  }
}
const SESSION_KEY = "session";

interface Session {
  items: DecryptedItem[];
  /** Éléments d'équipe qui n'ont pas pu être ouverts au déverrouillage. */
  unreadable: number;
  expiresAt: number;
}

let session: Session | null = null;

async function readSession(): Promise<Session | null> {
  if (session) return session;
  try {
    const stored = (await browser.storage.session.get(SESSION_KEY))[SESSION_KEY] as Session | undefined;
    if (stored && typeof stored.expiresAt === "number") session = stored;
  } catch {
    /* storage.session indisponible → pas de session */
  }
  return session;
}

async function lock(): Promise<void> {
  session = null;
  await browser.alarms.clear(ALARM);
  try {
    await browser.storage.session.remove(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

async function persist(): Promise<void> {
  try {
    if (session) await browser.storage.session.set({ [SESSION_KEY]: session });
  } catch {
    /* ignore */
  }
}

async function armAutoLock(): Promise<void> {
  const minutes = await getAutoLockMinutes();
  const expiresAt = Date.now() + minutes * 60_000;
  if (session) session.expiresAt = expiresAt;
  await browser.alarms.clear(ALARM);
  browser.alarms.create(ALARM, { when: expiresAt });
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
  // Les registres de l'application web (dossiers vides, partages en cours) sont stockés comme
  // des items ordinaires : on les ouvre pour savoir ce qu'ils sont, puis on les écarte. Les
  // montrer donnait deux entrées fantômes sans identifiant ni mot de passe.
  const items: DecryptedItem[] = [];
  for (const d of dtos) {
    const opened = decryptVaultItem(account, d.id, d.encryptedKey, d.encryptedData);
    if (opened.kind === "item") items.push(opened.item);
  }
  // Les coffres d'équipe, ouverts tant que les clés sont là. Leur échec ne bloque pas le
  // coffre personnel : il est compté et dit à l'écran.
  let unreadable = 0;
  try {
    const team = await loadTeamVaults(api, res.token, account, { openOrg, decryptOrgItem });
    items.push(...team.items);
    unreadable = team.unreadable;
  } catch {
    unreadable = 1;
  }
  // À partir d'ici, ni `password`, ni `account` (clés), ni `res.token` ne sont conservés.

  session = { items, unreadable, expiresAt: 0 };
  await armAutoLock();
  await persist();
  return { ok: true, items, unreadable };
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
    const [injection] = await browser.scripting.executeScript({
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
  if (s && s.expiresAt > Date.now()) {
    return { unlocked: true, items: s.items, unreadable: s.unreadable ?? 0 };
  }
  if (s) await lock(); // expirée
  return { unlocked: false };
}

browser.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
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
        case "armClipboardClear":
          // Une nouvelle copie repousse l'effacement : c'est la dernière qui compte.
          await browser.alarms.create(CLIPBOARD_ALARM, { delayInMinutes: CLIPBOARD_CLEAR_SECONDS / 60 });
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

// Le raccourci de remplissage. Il ne fait jamais plus que le popup : il remplit l'unique
// identifiant de la page, et sinon ouvre le popup, où l'utilisateur choisit ou déverrouille.
browser.commands.onCommand.addListener((command, tab) => {
  if (command !== "fill-login") return;
  void (async () => {
    const target = tab?.id != null ? tab : (await browser.tabs.query({ active: true, currentWindow: true }))[0];
    const s = await readSession();
    const open = s && s.expiresAt > Date.now() ? s.items : null;
    const action = shortcutAction(open, target?.url ? hostFromUrl(target.url) : null);
    if (action.kind === "fill" && target?.id != null) {
      const r = await doFill(action.item.id, target.id);
      if (r.ok && (r.username || r.password)) return;
    }
    await browser.action.openPopup().catch(() => {});
  })();
});

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void lock();
  if (alarm.name === CLIPBOARD_ALARM) void clearClipboard().catch(() => {});
});

// storage.session : accessible aux seuls contextes de confiance (jamais aux content scripts).
function hardenSessionStorage(): void {
  const store = browser.storage.session as unknown as {
    setAccessLevel?: (o: { accessLevel: string }) => Promise<void>;
  };
  store.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" }).catch(() => {});
}

browser.runtime.onInstalled.addListener(hardenSessionStorage);
browser.runtime.onStartup.addListener(hardenSessionStorage);

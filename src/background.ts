// Service worker (Manifest V3) — porteur de la session déverrouillée.
//
// Sécurité : au déverrouillage, le SW déchiffre le coffre une fois puis **jette** le mot de
// passe maître et les clés. Il ne conserve que les items déchiffrés dans `browser.storage.session`
// (mémoire seule, jamais sur disque, contexts de confiance uniquement, effacé à la fermeture du
// navigateur). Un `browser.alarms` verrouille automatiquement après inactivité. Comme storage.session
// survit au teardown du SW, la session persiste (plus de re-login à chaque ouverture du popup) sans
// rien persister sur disque ni retenir la moindre clé.
import { browser } from "./lib/browser.js";
import { api, baseActuelle, loadApiBase } from "./lib/api.js";
import {
  computeLoginHash,
  decryptVaultItem,
  ensureCryptoReady,
  unlock,
  type DecryptedItem,
} from "./lib/crypto.js";
import { fillCredentialsInPage } from "./lib/remplir.js";
import {
  ecrireLeCoffre,
  lireLeCoffre,
  oublierLeCoffre,
  type ElementChiffre,
} from "./lib/coffre-en-cache.js";

/** Le magasin réel, donné aux fonctions du cache. */
const magasin = browser.storage.local;
import {
  type CredentialResult,
  getAutoLockMinutes,
  pourLHote,
  type FillResult,
  type Message,
  type StateResult,
  type UnlockResult,
} from "./lib/messages.js";

const ALARM = "ghostpass-autolock";
// La clé porte une VERSION, et c'est ce qui a manqué.
//
// `storage.session` survit au rechargement de l'extension. Quand `DecryptedItem`
// est passé de `url` à `uris`, une session écrite par la version précédente a
// donc été relue par la nouvelle : `item.uris.some(...)` levait, le tri par
// domaine cassait en silence, et le popup montrait ses entrées dans le
// désordre — sans une erreur visible.
//
// Changer ce nom à chaque changement de forme rend la session d'avant
// simplement introuvable, donc un déverrouillage de plus, plutôt qu'un écran
// qui se comporte mal.
const SESSION_KEY = "session.v2";

interface Session {
  items: DecryptedItem[];
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

/** Ouvre des éléments chiffrés avec un compte déverrouillé.
 *
 * Les registres de l'application web (dossiers vides, partages en cours) sont
 * stockés comme des items ordinaires : on les ouvre pour savoir ce qu'ils sont,
 * puis on les écarte. Les montrer donnait deux entrées fantômes sans
 * identifiant ni mot de passe.
 */
function ouvrirLesElements(
  account: ReturnType<typeof unlock>,
  chiffres: ElementChiffre[],
): DecryptedItem[] {
  const items: DecryptedItem[] = [];
  for (const d of chiffres) {
    const opened = decryptVaultItem(account, d.id, d.encryptedKey, d.encryptedData);
    if (opened.kind === "item") items.push(opened.item);
  }
  return items;
}

/** Déverrouille depuis le cache local, SANS réseau ni second facteur.
 *
 * C'est le chemin normal après un verrouillage automatique. Rend `null` quand
 * il n'y a pas de cache pour ce compte ; lève quand le mot de passe est faux,
 * ce que l'appelant traduit en « mot de passe invalide » plutôt que de
 * retomber sur le réseau — un mot de passe faux doit se dire tout de suite.
 */
async function deverrouillerDepuisLeCache(
  email: string,
  password: string,
): Promise<UnlockResult | null> {
  const coffre = await lireLeCoffre(magasin, email, baseActuelle());
  if (!coffre) return null;

  const account = unlock(email, password, {
    kdfParams: coffre.kdfParams,
    encryptedUserKey: coffre.encryptedUserKey,
    encryptedPrivateKey: coffre.encryptedPrivateKey,
  });
  session = { items: ouvrirLesElements(account, coffre.elements), expiresAt: 0 };
  await armAutoLock();
  await persist();
  return { ok: true, items: session.items, depuisLeCache: true };
}

async function doUnlock(email: string, password: string, totpCode?: string): Promise<UnlockResult> {
  await loadApiBase();
  await ensureCryptoReady();

  // Le cache d'abord, et seulement si aucun code n'est présenté : fournir un
  // code, c'est demander explicitement une vraie connexion, donc une relève.
  if (!totpCode) {
    try {
      const depuisLeCache = await deverrouillerDepuisLeCache(email, password);
      if (depuisLeCache) return depuisLeCache;
    } catch {
      // Le cache existe et ne s'ouvre pas : le mot de passe est faux. Repasser
      // par le réseau ne ferait que redemander un code à six chiffres pour
      // finir par le même refus, quinze secondes plus tard.
      return { ok: false, error: "Mot de passe maître invalide." };
    }
  }

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
  const items = ouvrirLesElements(account, dtos);

  // Le coffre CHIFFRÉ est gardé, pour que le prochain déverrouillage se passe
  // de réseau et de second facteur. Voir `lib/coffre-en-cache.ts` pour ce que
  // cela coûte, et pourquoi tous les gestionnaires comparables l'acceptent.
  await ecrireLeCoffre(magasin, {
    email,
    base: baseActuelle(),
    kdfParams: res.kdfParams,
    encryptedUserKey: res.encryptedUserKey,
    encryptedPrivateKey: res.encryptedPrivateKey,
    elements: dtos,
    releveA: Date.now(),
  });

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
  if (s && s.expiresAt > Date.now()) return { unlocked: true, items: s.items };
  if (s) await lock(); // expirée
  return { unlocked: false };
}

/** Combien d'identifiants pour cet hôte — un NOMBRE, et rien d'autre.
 *
 * Le script de contenu tourne dans le contexte de la page, aux côtés du code
 * du site. Lui rendre des noms, des adresses ou a fortiori des mots de passe
 * les mettrait à portée de n'importe quel script de cette page. Un nombre
 * suffit à décider s'il faut proposer quelque chose.
 */
async function compterPourLHote(host: string): Promise<{ ok: boolean; nombre: number; verrouille: boolean }> {
  const s = await readSession();
  if (!s || s.expiresAt <= Date.now()) return { ok: true, nombre: 0, verrouille: true };
  return { ok: true, nombre: pourLHote(s.items, host).length, verrouille: false };
}

/** Remplit l'onglet d'où vient le message, avec le seul candidat s'il n'y en a qu'un.
 *
 * Quand il y en a plusieurs, on n'en choisit AUCUN : remplir au hasard poserait
 * le mauvais compte sans le dire, et l'utilisateur s'en apercevrait après avoir
 * validé. Le popup, lui, les montre et laisse choisir.
 */
async function remplirLOngletAppelant(
  tabId: number | undefined,
  url: string | undefined,
): Promise<FillResult> {
  if (tabId === undefined || !url) return { ok: false, error: "Onglet inconnu." };
  const s = await readSession();
  if (!s || s.expiresAt <= Date.now()) return { ok: false, error: "Coffre verrouillé." };
  const candidats = pourLHote(s.items, url);
  if (candidats.length === 0) return { ok: false, error: "Aucun identifiant pour ce site." };

  const seul = candidats.length === 1 ? candidats[0] : undefined;
  if (!seul) {
    // Plusieurs candidats : on n'en choisit AUCUN — remplir au hasard poserait
    // le mauvais compte sans le dire. On ouvre le popup, qui les montre et
    // laisse choisir. `openPopup` exige un geste de l'utilisateur, et le clic
    // sur la pastille en est un : il est relayé jusqu'ici par le message.
    try {
      await browser.action.openPopup();
      return { ok: true };
    } catch {
      // Chrome antérieur à 127, ou fenêtre sans barre d'outils. On le dit
      // plutôt que de rendre un « échec » qui n'explique rien.
      return {
        ok: false,
        error: `${candidats.length} identifiants pour ce site : ouvrez GhostPass pour choisir.`,
      };
    }
  }
  return doFill(seul.id, tabId);
}

/** L'identifiant pour l'hôte de l'onglet APPELANT, ou rien.
 *
 * Le garde est ici, et c'est le seul qui compte : l'hôte vient de
 * `sender.tab.url`, que le navigateur renseigne — jamais du message, qu'une
 * page pourrait forger. Un identifiant ne part donc que vers une page dont
 * l'hôte correspond à une adresse enregistrée sur cet élément.
 */
async function identifiantPourLAppelant(url: string | undefined): Promise<CredentialResult> {
  if (!url) return { ok: false, error: "Onglet inconnu." };
  const s = await readSession();
  if (!s || s.expiresAt <= Date.now()) return { ok: false, error: "Coffre verrouillé." };

  const candidats = pourLHote(s.items, url);
  if (candidats.length === 0) return { ok: false, error: "Aucun identifiant pour ce site." };
  if (candidats.length > 1) return { ok: false, plusieurs: candidats.length };

  const seul = candidats[0];
  if (!seul) return { ok: false, error: "Aucun identifiant pour ce site." };
  return { ok: true, cred: { username: seul.username, password: seul.password } };
}

browser.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
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
        case "logout":
          // Verrouiller ET oublier le coffre chiffré. Sans le second, « se
          // déconnecter » ne déconnecterait de rien : le prochain mot de passe
          // maître rouvrirait le cache, et le compte resterait joignable sur
          // cette machine après qu'on a cru l'en retirer.
          await lock();
          await oublierLeCoffre(magasin);
          sendResponse({ ok: true });
          break;
        case "fill":
          sendResponse(await doFill(message.itemId, message.tabId));
          break;
        case "countForHost":
          sendResponse(await compterPourLHote(message.host));
          break;
        case "credentialForFill":
          sendResponse(await identifiantPourLAppelant(sender.tab?.url));
          break;
        case "fillActiveTab":
          // L'onglet vient de l'EXPÉDITEUR, jamais du message : une page ne
          // doit pas pouvoir désigner un autre onglet que le sien.
          sendResponse(await remplirLOngletAppelant(sender.tab?.id, sender.tab?.url));
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

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void lock();
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

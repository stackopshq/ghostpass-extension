// Le cache ne rend un coffre qu'à qui il appartient.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// `doUnlock` appelait `api.login()` à CHAQUE déverrouillage : verrouiller
// équivalait à se déconnecter, et sur un compte à second facteur il fallait
// ressaisir le code à six chiffres toutes les quinze minutes. Ni Bitwarden ni
// Dashlane ne font cela — ils gardent le coffre CHIFFRÉ et le rouvrent
// localement.
//
// Le cache apporte donc deux gardes qui n'existaient pas, et dont l'absence ne
// se verrait pas tout de suite :
//
//   * un cache d'un AUTRE compte ne doit pas être rendu. Le rendre ferait
//     échouer le déverrouillage sur « mot de passe invalide », ce qui envoie
//     chercher au mauvais endroit ;
//   * un cache d'un AUTRE serveur non plus. Quelqu'un qui bascule vers son
//     instance de travail verrait le coffre de son instance personnelle
//     refuser de s'ouvrir, sans comprendre pourquoi.
//
// Et « se déconnecter » doit effacer le cache. Sans cela, le compte resterait
// joignable sur la machine après qu'on a cru l'en retirer — c'est le seul de
// ces tests qui porte sur autre chose qu'un désagrément.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ecrireLeCoffre,
  lireLeCoffre,
  oublierLeCoffre,
  type Magasin,
} from "../src/lib/coffre-en-cache.ts";

// Un faux magasin, en mémoire. Le module prend le sien en paramètre, ce qui le
// rend éprouvable sans extension ni navigateur.
const disque = new Map<string, unknown>();
const magasin: Magasin = {
  get: async (cle) => ({ [cle]: disque.get(cle) }),
  set: async (o) => {
    for (const [k, v] of Object.entries(o)) disque.set(k, v);
  },
  remove: async (cle) => {
    disque.delete(cle);
  },
};

const COFFRE = {
  email: "clara@stackops.ch",
  base: "https://pass.ghostsuite.cloud",
  kdfParams: "argon2id$64$3",
  encryptedUserKey: "cle-utilisateur-chiffree",
  encryptedPrivateKey: "cle-privee-chiffree",
  elements: [{ id: "1", encryptedKey: "k", encryptedData: "d" }],
  releveA: 1_700_000_000_000,
};

test("un coffre écrit se relit pour le même compte et le même serveur", async () => {
  disque.clear();
  await ecrireLeCoffre(magasin, COFFRE);
  const relu = await lireLeCoffre(magasin, COFFRE.email, COFFRE.base);
  assert.deepEqual(relu, COFFRE);
});

test("le coffre d'un autre compte n'est pas rendu", async () => {
  disque.clear();
  await ecrireLeCoffre(magasin, COFFRE);
  assert.equal(await lireLeCoffre(magasin, "quelquun-dautre@stackops.ch", COFFRE.base), null);
});

test("le coffre d'un autre serveur n'est pas rendu", async () => {
  disque.clear();
  await ecrireLeCoffre(magasin, COFFRE);
  assert.equal(await lireLeCoffre(magasin, COFFRE.email, "https://vault.interne.example"), null);
});

// LE test qui porte sur la sécurité et non sur le confort.
test("se déconnecter efface le coffre", async () => {
  disque.clear();
  await ecrireLeCoffre(magasin, COFFRE);
  await oublierLeCoffre(magasin);
  assert.equal(await lireLeCoffre(magasin, COFFRE.email, COFFRE.base), null);
  assert.equal(disque.size, 0, "un reste sur le disque rend la déconnexion illusoire");
});

test("un disque vide ne rend rien, et ne lève pas", async () => {
  disque.clear();
  assert.equal(await lireLeCoffre(magasin, COFFRE.email, COFFRE.base), null);
});

// Un enregistrement tronqué par une mise à jour ou une écriture interrompue ne
// doit pas faire lever le service worker : le déverrouillage doit simplement
// repasser par le réseau.
test("un coffre malformé est traité comme absent", async () => {
  disque.clear();
  disque.set("coffreEnCache", { email: COFFRE.email, base: COFFRE.base });
  assert.equal(await lireLeCoffre(magasin, COFFRE.email, COFFRE.base), null);
});

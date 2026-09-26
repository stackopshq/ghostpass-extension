// Ce que l'extension propose sur une page, et ce qu'elle ne lui dit jamais.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// L'extension savait remplir, mais seulement si l'on cliquait sur son icône :
// aucun script n'était injecté dans les pages, donc rien ne pouvait remarquer
// un formulaire de connexion. Le remplissage était un geste qu'on déclenchait,
// jamais une offre.
//
// Le script de contenu ajouté tourne désormais sur tous les sites en https,
// aux côtés du code de chaque page. C'est une surface neuve, et ces tests
// tiennent la règle qui décide ce qui s'y affiche.
//
// LA RÈGLE DE SÉCURITÉ QUI GOUVERNE TOUT LE RESTE
// ------------------------------------------------
// Le script de contenu ne reçoit qu'un NOMBRE. Jamais un nom, jamais une
// adresse, jamais un mot de passe — tout secret qui y transiterait serait à la
// portée d'un script malveillant de la page. Le remplissage reste dans le
// service worker, qui l'injecte au clic.
//
// `pourLHote` est la règle qui décide s'il y a quelque chose à proposer. Elle
// vit dans `messages.ts` et non enfouie dans un `switch` du service worker :
// une règle enfouie là n'est éprouvable qu'en chargeant l'extension dans un
// navigateur, c'est-à-dire jamais.

import { test } from "node:test";
import assert from "node:assert/strict";
import { pourLHote } from "../src/lib/hotes.ts";

const COFFRE = [
  { id: "1", uris: ["https://connect.ulys.com/login", "https://user.ulys.com"] },
  { id: "2", uris: ["https://compte.ulys.com"] },
  { id: "3", uris: ["https://banque.example"] },
  { id: "4", uris: [] },
  // Une adresse VIDE dans la liste. Un import depuis un autre gestionnaire en
  // produit, et c'est le cas qui éprouve vraiment la règle : une liste vide ne
  // l'atteint jamais, puisqu'il n'y a rien à comparer.
  { id: "5", uris: [""] },
];

// LE test du cas Ulys, que Kevin a signalé : un même compte, deux portes
// d'entrée. Deux sous-domaines FRÈRES ne correspondent pas entre eux — et
// c'est voulu, sinon un identifiant de  serait proposé sur
// . La réponse est de stocker les DEUX adresses sur
// l'élément, ce que le format permet depuis l'origine.
test("un élément à deux adresses est proposé sur les deux", () => {
  assert.deepEqual(pourLHote(COFFRE, "connect.ulys.com").map((i) => i.id), ["1"]);
  assert.deepEqual(pourLHote(COFFRE, "user.ulys.com").map((i) => i.id), ["1"]);
});

test("deux sous-domaines frères ne se confondent pas", () => {
  // `compte.ulys.com` n'est porté que par l'élément 2.
  assert.deepEqual(pourLHote(COFFRE, "compte.ulys.com").map((i) => i.id), ["2"]);
});

test("un domaine voisin ne ramène rien", () => {
  assert.deepEqual(pourLHote(COFFRE, "banque.example").map((i) => i.id), ["3"]);
  assert.deepEqual(pourLHote(COFFRE, "autre-site.example"), []);
});

// Un élément sans adresse ne doit correspondre à AUCUN site. Le faire
// correspondre à tous ferait apparaître une proposition sur chaque page du
// web, ce qui est le meilleur moyen qu'on cesse de la regarder.
test("un élément sans adresse ne correspond à rien", () => {
  for (const hote of ["ulys.com", "banque.example", "n-importe-quoi.test"]) {
    const ids = pourLHote(COFFRE, hote).map((i) => i.id);
    assert.ok(!ids.includes("4"), `liste vide proposée sur ${hote}`);
    // Celui-ci est le vrai garde : une adresse vide ne doit pas correspondre à
    // TOUT. Sans lui, une comparaison indulgente sur les valeurs nulles ferait
    // apparaître une proposition sur chaque page du web, et le test ci-dessus
    // ne le verrait pas — une liste vide n'atteint jamais la comparaison.
    assert.ok(!ids.includes("5"), `adresse vide proposée sur ${hote}`);
  }
});

// `www.` ne distingue pas deux sites, et un coffre importé d'un autre
// gestionnaire en contient des deux formes.
test("le préfixe www ne sépare pas deux formes du même site", () => {
  const items = [{ id: "a", uris: ["https://www.banque.example"] }];
  assert.equal(pourLHote(items, "banque.example").length, 1);
  assert.equal(pourLHote(items, "www.banque.example").length, 1);
});

// LE test qui porte sur la sécurité : ce n'est pas la liste qui traverse vers
// la page, c'est sa TAILLE. Si un jour quelqu'un renvoie les éléments
// eux-mêmes au script de contenu, ce test ne l'attrapera pas — mais le
// commentaire ci-dessus et l'en-tête de `content.ts` disent pourquoi il ne
// faut pas. Ici on fige au moins que la règle rend des éléments, donc qu'elle
// n'est pas conçue pour être envoyée telle quelle.
test("la règle rend des éléments, que l'appelant doit réduire à un nombre", () => {
  const resultat = pourLHote(COFFRE, "connect.ulys.com");
  assert.ok(Array.isArray(resultat));
  assert.equal(typeof resultat.length, "number");
});

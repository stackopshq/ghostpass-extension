// Ce que le remplissage écrit, et où.
//
// POURQUOI CE FICHIER EXISTE
// --------------------------
// `fillCredentialsInPage` est la fonction qui pose un mot de passe dans une
// page. C'était la plus risquée de l'extension, et elle n'était couverte par
// rien : elle ne s'exécutait qu'injectée dans un vrai navigateur.
//
// Sa partie délicate n'est pas le mot de passe — il y a un seul champ de type
// `password` — c'est l'IDENTIFIANT. Rien ne le marque : il faut le deviner
// parmi les `input` du formulaire, et se tromper remplit le mauvais champ,
// parfois un champ de recherche ou un code promotionnel.
//
// jsdom donne un vrai DOM à ces tests. C'est une dépendance de développement
// de plus, et elle se justifie ici précisément : sans elle, cette fonction
// reste éprouvée nulle part.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { fillCredentialsInPage } from "../src/lib/remplir.ts";

const CRED = { username: "clara@stackops.ch", password: "un-mot-de-passe" };

function page(html: string): Document {
  const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { pretendToBeVisual: true });
  const g = globalThis as Record<string, unknown>;
  g.document = dom.window.document;
  g.Event = dom.window.Event;
  // `offsetParent` vaut toujours `null` sous jsdom, ce qui ferait juger tous
  // les champs invisibles. On le rend véridique : un élément attaché au
  // document a un parent de mise en page.
  Object.defineProperty(dom.window.HTMLElement.prototype, "offsetParent", {
    get(this: HTMLElement) {
      return this.isConnected ? dom.window.document.body : null;
    },
    configurable: true,
  });
  return dom.window.document;
}

function valeur(doc: Document, selecteur: string): string {
  return (doc.querySelector(selecteur) as HTMLInputElement | null)?.value ?? "";
}

test("un formulaire ordinaire reçoit les deux valeurs", () => {
  const doc = page(`
    <form>
      <input type="email" name="email">
      <input type="password" name="password">
    </form>`);
  const fait = fillCredentialsInPage(CRED);
  assert.deepEqual(fait, { username: true, password: true });
  assert.equal(valeur(doc, 'input[name="email"]'), CRED.username);
  assert.equal(valeur(doc, 'input[name="password"]'), CRED.password);
});

// LE cas qui casse en vrai : un champ de recherche AVANT le formulaire de
// connexion. Le prendre pour l'identifiant écrit une adresse dans la barre de
// recherche du site, et laisse la connexion vide.
test("un champ de recherche hors du formulaire n'est pas pris pour l'identifiant", () => {
  const doc = page(`
    <input type="text" name="q" placeholder="Rechercher">
    <form>
      <input type="text" name="login">
      <input type="password" name="password">
    </form>`);
  fillCredentialsInPage(CRED);
  assert.equal(valeur(doc, 'input[name="q"]'), "", "la recherche a été remplie");
  assert.equal(valeur(doc, 'input[name="login"]'), CRED.username);
});

// Le champ écarté doit être celui que la sélection CHOISIRAIT sans le filtre,
// sinon le test ne mord pas. Une première version mettait un `type="text"`
// désactivé à côté d'un `type="email"` valide : la sélection préfère les
// `email` avant de regarder les noms, donc le champ désactivé n'était de toute
// façon jamais candidat, et retirer le filtre ne changeait rien.
//
// Ici le champ désactivé EST un `type="email"`, et il vient en premier.
test("un champ désactivé n'est pas rempli, même s'il serait le meilleur candidat", () => {
  const doc = page(`
    <form>
      <input type="hidden" name="csrf">
      <input type="email" name="piege" disabled>
      <input type="email" name="email">
      <input type="password" name="password">
    </form>`);
  fillCredentialsInPage(CRED);
  assert.equal(valeur(doc, 'input[name="piege"]'), "", "un champ désactivé a été rempli");
  assert.equal(valeur(doc, 'input[name="email"]'), CRED.username);
  assert.equal(valeur(doc, 'input[name="csrf"]'), "", "un champ caché a été rempli");
});

// Les cadres modernes n'observent pas l'affectation de `value` : sans les
// évènements, le champ paraît rempli à l'œil et vide au formulaire, et la
// connexion échoue sans que personne comprenne.
test("les évènements input et change sont émis", () => {
  const doc = page(`<form><input type="password" name="password"></form>`);
  const champ = doc.querySelector('input[name="password"]') as HTMLInputElement;
  const vus: string[] = [];
  champ.addEventListener("input", () => vus.push("input"));
  champ.addEventListener("change", () => vus.push("change"));
  fillCredentialsInPage(CRED);
  assert.deepEqual(vus, ["input", "change"]);
});

// Une page sans champ de mot de passe n'est pas une page de connexion. Rendre
// `password: true` ferait croire à un remplissage qui n'a pas eu lieu.
test("sans champ de mot de passe, rien n'est écrit et le dit", () => {
  page(`<form><input type="text" name="login"></form>`);
  const fait = fillCredentialsInPage(CRED);
  assert.equal(fait.password, false);
});

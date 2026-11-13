import { test } from "node:test";
import assert from "node:assert/strict";
import { hostFromUrl, matchesHost, suggestionsFor } from "../src/lib/site-match.ts";

const login = (name: string, ...urls: string[]) => ({ name, url: urls[0] ?? "", urls, kind: "Login" });

test("l'hôte de la page est normalisé", () => {
  assert.equal(hostFromUrl("https://www.GitHub.com/login?x=1"), "github.com");
  assert.equal(hostFromUrl("github.com"), "github.com");
  assert.equal(hostFromUrl("chrome://newtab"), "newtab");
  assert.equal(hostFromUrl(""), null);
});

test("toutes les adresses d'un élément comptent, pas seulement la première", () => {
  assert.ok(matchesHost(login("Google", "https://mail.google.com", "https://accounts.google.com"), "accounts.google.com"));
});

test("un sous-domaine correspond, un domaine voisin non", () => {
  assert.ok(matchesHost(login("GitHub", "https://github.com"), "gist.github.com"));
  assert.ok(!matchesHost(login("GitHub", "https://github.com"), "evil-github.com"));
  assert.ok(!matchesHost(login("GitHub", "https://github.com"), "github.com.evil.io"));
});

test("seuls les identifiants sont proposés, triés par nom", () => {
  const items = [
    login("Zeta", "https://example.com"),
    { name: "Carte", url: "https://example.com", urls: ["https://example.com"], kind: "Card" },
    login("Alpha", "https://login.example.com"),
    login("Autre", "https://other.org"),
  ];
  assert.deepEqual(suggestionsFor(items, "example.com").map((i) => i.name), ["Alpha", "Zeta"]);
  assert.deepEqual(suggestionsFor(items, null), []);
});

test("une session ouverte avant cette version, sans `urls`, se compare encore", () => {
  assert.ok(matchesHost({ name: "Vieux", url: "https://github.com" }, "github.com"));
});

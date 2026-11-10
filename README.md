<p align="center">
  <img src="assets/logo/ghostpass.png" alt="GhostPass" width="90">
</p>

# GhostPass — Extension navigateur 👻

Extension **Manifest V3** du gestionnaire **zero-knowledge** GhostPass, pour **Chrome/Edge/Brave**,
**Firefox** et **Safari** (macOS/iOS). Tout le chiffrement a lieu dans le module **WASM** partagé
avec la web app ; le serveur ne voit que des blobs chiffrés.

> Le cœur crypto étant du WebAssembly, le manifeste déclare une CSP `script-src 'self'
> 'wasm-unsafe-eval'` (obligatoire en MV3 pour compiler le WASM ; aucun code distant n'est chargé).
> Le code est écrit une fois (API `chrome.*`, aliasée sur Firefox/Safari) ; seuls quelques réglages
> de manifeste diffèrent par navigateur (voir *Navigateurs* ci-dessous).

## Architecture

- **Popup** (Svelte) : vue de la session — déverrouille (email + mot de passe maître), liste/copie
  les secrets. Il ne fait plus de crypto lui-même : il délègue au service worker.
- **Service worker** (`src/background.ts`) : **porteur de la session**. Au déverrouillage il déchiffre
  le coffre une fois puis **jette le mot de passe maître et les clés** ; il ne garde que les items
  déchiffrés dans `chrome.storage.session` (mémoire seule, jamais sur disque, contexts de confiance
  uniquement). **Verrouillage auto** via `chrome.alarms` (délai réglable), à la fermeture du
  navigateur, ou manuel. La session survit au teardown du SW → plus de re-login à chaque ouverture.
- **Cœur crypto** : dépend de `@stackops/ghostpass-crypto-wasm` publié sur le **registre npm de
  l'instance Gitea** - plus de dépendance cross-repo `file:`. Tourne aussi dans le SW (autorisé
  par la CSP).

```
ghostpass-extension/
  manifest.config.ts     manifest MV3 (via @crxjs)
  src/popup/             UI Svelte du popup
  src/lib/               crypto (WASM) + client API
  src/background.ts      service worker
```

## Prérequis

Le cœur crypto est tiré du **registre npm du projet GitLab `ghostpass`**
(`@stackops/ghostpass-crypto-wasm`). Authentifie npm avec un jeton GitLab portant le scope
`read_api` :

```bash
export NODE_AUTH_TOKEN="<jeton GitLab, scope read_api>"
```

Publier une nouvelle version du WASM : lancer le job manuel **publier-wasm** du pipeline de `main`
du projet `ghostpass`, puis bumper la version dans `package.json`.

## Développer

```bash
npm install
npm run dev      # build watch ; charger dist/ en extension non empaquetée
npm run build    # build de production → dist/
npm run build:dev  # build one-shot en mode développement (backend local autorisé)
npm run check    # svelte-check (typage)
npm run icons    # régénère assets/logo/icon-*.png depuis le SVG
npm run package  # build + ZIP Chrome Web Store → artifacts/
```

**Le backend de dev n'existe qu'en mode développement.** `npm run dev` et `npm run build:dev`
déclarent `host_permissions: ["http://localhost:3000/*"]` et pointent par défaut sur
`http://localhost:3000` ; `npm run build` ne fait ni l'un ni l'autre. Un paquet publié qui
demanderait cette permission la ferait accorder par chaque utilisateur sans jamais lui servir, et
un relecteur du Store la verrait. Le discriminant est le **mode Vite**, lu au même endroit par
`manifest.config.ts` et par `src/lib/api.ts` — pas `import.meta.env.DEV`, qui reste faux sous
`vite build --mode development` et ferait diverger les deux en silence.

Charger dans le navigateur : `chrome://extensions` → **Mode développeur** → **Charger l'extension
non empaquetée** → sélectionner `dist/`.

## Navigateurs

Un seul code source, trois cibles de build (le manifeste diffère à la marge selon le navigateur) :

| Navigateur | Build | Chargement |
|---|---|---|
| **Chrome / Edge / Brave** | `npm run build` → `dist/` | `chrome://extensions` → *Charger l'extension non empaquetée* → `dist/` |
| **Firefox** | `npm run build:firefox` → `dist-firefox/` | `about:debugging` → *Ce Firefox* → *Charger un module temporaire* → `dist-firefox/manifest.json` |
| **Safari** (macOS/iOS) | `npm run build:safari` → projet Xcode `safari/` | ouvrir `safari/GhostPass.xcodeproj` dans Xcode, builder/signer |

- **Firefox** : `build:firefox` reprend le build Chrome et ajuste le manifeste
  (`browser_specific_settings.gecko` + background **event page module** au lieu de `service_worker`).
  Vérifier : `npm run lint:firefox` (web-ext). Validé sur **Firefox ESR 140** (lint 0 erreur,
  chargement OK).
- **Safari** : la conversion passe par `xcrun safari-web-extension-converter` (script
  `build:safari`), qui **exige macOS + Xcode** — impossible sur Linux/CI non-macOS. Le code
  (WebExtensions MV3, `chrome.*`) est compatible **Safari 16.4+** ; compilation, signature et tests
  se font dans Xcode sur un Mac.

## Configuration

Le backend par défaut est `http://localhost:3000` (dev). Pour une instance distante, ouvrir la
**page d'options** (icône ⚙ du popup, ou `chrome://extensions` → Détails → Options) et saisir son
URL `https://` : le navigateur demande alors l'autorisation d'accéder à ce domaine
(`optional_host_permissions`), et l'URL est mémorisée dans `chrome.storage`. Aucune IP n'est codée
en dur dans le manifeste.

## Version, icônes et paquet

**Une seule version.** `package.json` la porte ; `manifest.config.ts` la lit. Deux nombres qui
doivent monter ensemble sans que rien ne l'impose finissent toujours par diverger, et c'est celui
du manifeste que le Store refuse quand il n'a pas bougé. Pour publier : bumper `package.json`,
rien d'autre.

**Les icônes ne sont pas le logo réduit.** Le logo (`assets/logo/ghostpass.svg`) est un tracé de
22 unités sur 548 : à 16 px, la taille à laquelle une icône de barre d'outils est réellement
regardée, le trait fait six dixièmes de pixel et disparaît. Les icônes viennent donc de
`assets/logo/ghostpass-icon.svg` — même silhouette, **remplie**, glyphe creusé, tirets détachés
abandonnés. Les deux SVG sont produits par `tools/brand/ghost_suite.py` (dépôt `apollo-platform`)
et vendorés ici pour que ce dépôt sache refaire ses propres icônes. `npm run icons` régénère les
PNG ; ne jamais retoucher un PNG à la main.

**Le paquet est produit par la CI, pas par un poste.** Le job `package` construit et vérifie
(version réelle, manifeste aligné sur `package.json`, aucune `host_permissions` de dev, icônes
16/48/128 déclarées) puis produit `artifacts/ghostpass-chrome-<version>.zip` avec son `sha256`,
attaché au run. L'archive est **déterministe** — entrées triées, horodatage fixe — donc le même
commit donne les mêmes octets, et on peut toujours répondre à « le paquet en ligne, c'est quel
commit ? ». `npm run package` refait exactement la même archive en local.

Les éléments de la fiche du Store (usage unique, justification de chaque permission, déclaration
d'usage des données) sont écrits dans [`docs/chrome-web-store.md`](docs/chrome-web-store.md) et
non dans le navigateur au moment de la soumission.

## CI

`.gitlab-ci.yml` installe le WASM depuis le registre npm du projet `ghostpass` avec
`CI_JOB_TOKEN` : `ghostpass` autorise ce projet dans sa liste d'accès des jetons de job (gérée
dans `gitlab-admin`). Le paquet est publié par le job `publier-wasm` de `ghostpass`.

Le job `safari` est **manuel uniquement** : il exige un runner macOS (tag `macos`), que le groupe
n'héberge pas encore.

## État

**Lecture seule.** L'extension consulte et remplit ; elle ne crée, ne modifie et ne supprime
aucune entrée — les seules requêtes d'écriture qu'elle émette sont `prelogin` et `login`. C'est un
arbitrage assumé, pas un manque à combler : la fiche du Store doit l'annoncer dès sa première
ligne, faute de quoi l'utilisateur le découvre en pleine création de compte.

MVP : déverrouillage + liste + copie (avec **auto-effacement du presse-papier**), **session dans le
service worker** avec **verrouillage automatique** (délai réglable), **autofill** de l'onglet actif,
et **page d'options** (backend + auto-lock). Builds **Chrome / Firefox / Safari** (voir
*Navigateurs*). **À venir** : passkeys (voir la note WebAuthn / Related Origin Requests).

### Autofill

Le popup détecte le domaine de l'onglet actif et **remonte les identifiants correspondants**. Un
clic sur **Remplir** (⌨) envoie au service worker qui **injecte à la demande** (via `activeTab` +
`scripting`, sur ce seul geste) une fonction remplissant les champs `username`/`password` de la page.
Pas de content script permanent, pas de remplissage automatique au chargement, pas d'accès large aux
pages — l'injection est limitée à l'onglet actif et déclenchée par l'utilisateur.

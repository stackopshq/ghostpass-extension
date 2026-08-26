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

Le cœur crypto est tiré de **GitHub Packages**. Authentifie npm (token avec `read:packages`) :

```bash
export NODE_AUTH_TOKEN="$(gh auth token)"   # ou un PAT fine-grained read:packages
```

Publier une nouvelle version du WASM : lancer le workflow **Publish WASM** du repo `ghostpass`
(`gh workflow run publish-wasm.yml -f version=X.Y.Z`), puis bumper la version dans `package.json`.

## Développer

```bash
npm install
npm run dev      # build watch ; charger dist/ en extension non empaquetée
npm run build    # build de production → dist/
npm run check    # svelte-check (typage)
```

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

## CI

`/.github/workflows/ci.yml` installe le WASM depuis le registre npm de l'instance Gitea. Le jeton
auto-injecté par Gitea Actions ne porte pas de scope `package` : la CI utilise le PAT
`REGISTRY_TOKEN`, partagé au niveau de l'organisation `stackops`. Le paquet est publié par le
workflow `publish-wasm.yml` du dépôt `ghostpass`.

## État

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

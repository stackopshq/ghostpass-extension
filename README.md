# GhostPass — Extension navigateur 👻

Extension **Manifest V3** (navigateurs Chromium : Chrome / Edge / Brave) du gestionnaire
**zero-knowledge** GhostPass. Tout le chiffrement a lieu dans le module **WASM** partagé avec la
web app ; le serveur ne voit que des blobs chiffrés.

> Le cœur crypto étant du WebAssembly, le manifeste déclare une CSP `script-src 'self'
> 'wasm-unsafe-eval'` (obligatoire en MV3 pour compiler le WASM ; aucun code distant n'est chargé).
> Firefox (MV3 `background.scripts` + `browser_specific_settings`) est prévu, non encore supporté.

## Architecture

- **Popup** (Svelte) : vue de la session — déverrouille (email + mot de passe maître), liste/copie
  les secrets. Il ne fait plus de crypto lui-même : il délègue au service worker.
- **Service worker** (`src/background.ts`) : **porteur de la session**. Au déverrouillage il déchiffre
  le coffre une fois puis **jette le mot de passe maître et les clés** ; il ne garde que les items
  déchiffrés dans `chrome.storage.session` (mémoire seule, jamais sur disque, contexts de confiance
  uniquement). **Verrouillage auto** via `chrome.alarms` (délai réglable), à la fermeture du
  navigateur, ou manuel. La session survit au teardown du SW → plus de re-login à chaque ouverture.
- **Cœur crypto** : dépend de `@stackopshq/ghostpass-crypto-wasm` publié sur **GitHub Packages**
  (npm) — plus de dépendance cross-repo `file:`. Tourne aussi dans le SW (autorisé par la CSP).

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

## Configuration

Le backend par défaut est `http://localhost:3000` (dev). Pour une instance distante, ouvrir la
**page d'options** (icône ⚙ du popup, ou `chrome://extensions` → Détails → Options) et saisir son
URL `https://` : le navigateur demande alors l'autorisation d'accéder à ce domaine
(`optional_host_permissions`), et l'URL est mémorisée dans `chrome.storage`. Aucune IP n'est codée
en dur dans le manifeste.

## CI

`/.github/workflows/ci.yml` installe le WASM depuis GitHub Packages via `GITHUB_TOKEN`. Le package
`@stackopshq/ghostpass-crypto-wasm` doit autoriser ce repo (Package settings → *Manage Actions
access* → ajouter `ghostpass-extension`), ou être en visibilité *internal*.

## État

MVP : déverrouillage + liste + copie (avec **auto-effacement du presse-papier**), **session dans le
service worker** avec **verrouillage automatique** (délai réglable dans les options), et **page
d'options** (backend + auto-lock). **À venir** : autofill (content script), passkeys, support Firefox.

# GhostPass — Extension navigateur 👻

Extension **Manifest V3** (navigateurs Chromium : Chrome / Edge / Brave) du gestionnaire
**zero-knowledge** GhostPass. Tout le chiffrement a lieu dans le module **WASM** partagé avec la
web app ; le serveur ne voit que des blobs chiffrés.

> Le cœur crypto étant du WebAssembly, le manifeste déclare une CSP `script-src 'self'
> 'wasm-unsafe-eval'` (obligatoire en MV3 pour compiler le WASM ; aucun code distant n'est chargé).
> Firefox (MV3 `background.scripts` + `browser_specific_settings`) est prévu, non encore supporté.

## Architecture

- **Popup** (Svelte) : déverrouille le coffre (email + mot de passe maître), liste/copie les secrets.
- **Service worker** (`src/background.ts`) : point d'extension (autofill, lock auto — à venir).
- **Cœur crypto** : dépend de `@stackopshq/ghostpass-crypto-wasm` publié sur **GitHub Packages**
  (npm) — plus de dépendance cross-repo `file:`.

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

MVP : déverrouillage + liste + copie (avec **auto-effacement du presse-papier**) + **page d'options**
pour le backend. **À venir** : autofill (content script), **verrouillage auto** via session dans le
service worker (le popup ne conserve rien après fermeture), passkeys, support Firefox.

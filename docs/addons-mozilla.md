# Fiche addons.mozilla.org — GhostPass

Même principe que `chrome-web-store.md` : tout ce que le tableau de bord d'AMO demande de
saisir à la main **vit ici**. Ce qui se crée en cliquant échappe au dépôt sans que personne
décide de l'en exclure, et à la soumission suivante plus personne ne sait ce qui avait été
déclaré ni pourquoi.

**Mode d'emploi** : copier-coller les blocs ci-dessous dans le formulaire. Si une réponse
doit changer pendant l'examen, la changer **ici d'abord**, puis dans le formulaire.

---

## 0. Le choix de distribution

**« Sur ce site » (gestion via AMO)**, pas l'auto-distribution.

L'auto-distribution oblige à héberger le `.xpi` *et* un manifeste de mise à jour, et à poser
`update_url` dans le manifeste — de l'infrastructure à tenir pour toujours. Surtout, une
extension auto-distribuée ne s'installe que si on en a le lien : personne ne la trouve en
cherchant « GhostPass » dans Firefox.

Le dépôt est déjà réglé pour ce choix : `scripts/build-firefox.mjs` pose l'identifiant
`ghostpass@stackops.ch`, `strict_min_version: "128.0"` et la déclaration de collecte de
données qu'AMO exige désormais de toute nouvelle extension.

---

## 1. Identité de la fiche

| Champ AMO | Valeur |
|---|---|
| Nom | `GhostPass` |
| URL de la fiche | `ghostpass` (addons.mozilla.org/addon/ghostpass) |
| Catégories (max. 2) | **Confidentialité et sécurité**, **Autre** |
| Licence | MIT |
| Site d'assistance | `https://ghostsuite.cloud/ghostpass/` |
| Adresse d'assistance | `contact@stackops.ch` |
| Étiquettes | `password manager`, `self-hosted`, `zero-knowledge`, `autofill`, `privacy` |
| Paquet | `dist-firefox/`, zippé — voir §6 |

La langue par défaut de la fiche est le **français**, avec une traduction **en-US** : AMO
sert à chaque visiteur la langue qu'il a, et une fiche française seule devient illisible
pour l'essentiel de son public.

---

## 2. Résumé (250 caractères max)

```
Consulte et remplit les identifiants de VOTRE serveur GhostPass auto-hébergé. Le chiffrement a lieu dans le navigateur ; le serveur ne voit que des blocs qu'il ne peut pas lire. Lecture seule : cette version ne crée ni ne modifie d'entrée.
```

```
Reads and fills the logins from YOUR own GhostPass server. Encryption happens in the browser; the server only ever holds blocks it cannot read. Read-only: this version does not create or edit entries.
```

> **La limite est annoncée dès la première phrase**, comme sur le Chrome Web Store, et pour
> la même raison : un gestionnaire de mots de passe qui ne sait pas enregistrer un mot de
> passe sans le dire se fait découvrir au pire moment, en pleine création de compte.

---

## 3. Description

```
GhostPass est un coffre-fort de mots de passe zero-knowledge que vous hébergez vous-même.
Cette extension en est la fenêtre dans le navigateur.

⚠️ LECTURE SEULE. Cette version consulte le coffre et remplit les formulaires. Elle ne
crée, ne modifie et ne supprime aucune entrée : pour cela, utilisez l'application web de
votre instance. C'est un choix assumé, pas un oubli — la surface d'écriture d'un
gestionnaire de mots de passe est l'endroit où une erreur coûte le plus cher.

⚠️ IL VOUS FAUT VOTRE PROPRE SERVEUR. L'extension ne fonctionne pas seule et ne se connecte
à aucun service exploité par nous. À la première ouverture, indiquez dans les options
l'adresse HTTPS de votre instance GhostPass.

CE QU'ELLE FAIT
• Déverrouillage par e-mail et mot de passe maître (avec second facteur si votre instance
  l'exige)
• Liste et recherche de vos identifiants, ceux des coffres d'équipe compris
• Copie du mot de passe, effacé du presse-papiers au bout de 30 secondes, même popup fermé
• Remplissage du formulaire de connexion de l'onglet actif, sur votre clic — jamais
  automatiquement au chargement d'une page
• Raccourci Ctrl+Maj+L (Cmd+Maj+L sur Mac) : remplit l'identifiant de la page s'il est seul,
  ouvre GhostPass sinon
• Verrouillage automatique après un délai que vous réglez, à la fermeture du navigateur,
  ou à la demande

ZERO-KNOWLEDGE, CONCRÈTEMENT
Le chiffrement et le déchiffrement ont lieu dans votre navigateur, dans un module
WebAssembly partagé avec l'application web. Votre mot de passe maître ne quitte jamais
votre machine : le serveur ne reçoit qu'une empreinte dérivée, et ne stocke que des blocs
chiffrés qu'il ne peut pas lire.

Une fois le coffre déverrouillé, les identifiants déchiffrés vivent en mémoire dans la page
d'arrière-plan, jamais sur le disque, et sont effacés au verrouillage.

Logiciel libre, licence MIT. Le code est public : gitlab.com/stackopsplatform/products/ghostsuite/ghostpass-extension
```

La version anglaise est la traduction mot pour mot de celle-ci ; elle vit dans le même
fichier pour que les deux ne divergent pas.

```
GhostPass is a zero-knowledge password vault you host yourself. This extension is its
window in the browser.

⚠️ READ-ONLY. This version reads the vault and fills forms. It does not create, edit or
delete entries — use your instance's web app for that. This is a deliberate choice, not an
oversight: the writing surface of a password manager is where a mistake costs the most.

⚠️ YOU NEED YOUR OWN SERVER. The extension does not work on its own and connects to no
service operated by us. On first run, enter the HTTPS address of your GhostPass instance in
the options page.

WHAT IT DOES
• Unlock with e-mail and master password (with a second factor if your instance requires one)
• List and search your logins, including team vaults
• Copy a password, cleared from the clipboard after 30 seconds, even once the popup is closed
• Fill the active tab's sign-in form, on your click — never automatically on page load
• Ctrl+Shift+L (Cmd+Shift+L on a Mac): fills the page's login if there is only one, opens
  GhostPass otherwise
• Auto-lock after a delay you choose, on browser close, or on demand

ZERO-KNOWLEDGE, CONCRETELY
Encryption and decryption happen in your browser, in a WebAssembly module shared with the
web app. Your master password never leaves your machine: the server receives only a locally
derived proof, and stores only encrypted blocks it cannot read.

Once the vault is unlocked, the decrypted entries live in memory in the background page,
never on disk, and are wiped on lock.

Free software, MIT licence.
```

---

## 4. Collecte de données

Le manifeste Firefox la **déclare déjà** (`browser_specific_settings.gecko.data_collection_permissions`),
et AMO relit cette déclaration : `personallyIdentifyingInfo` et `authenticationInfo`,
toutes deux **requises**. Le formulaire reprendra ces deux cases ; les réponses libres :

```
Aucune donnée n'est transmise aux auteurs de l'extension, ni à aucun tiers. La seule
destination réseau est le serveur GhostPass que l'utilisateur a lui-même configuré.

L'adresse e-mail est transmise à ce serveur : c'est l'identifiant de connexion.

Le mot de passe maître ne quitte jamais l'appareil : le serveur ne reçoit qu'une empreinte
dérivée localement, qui ne permet pas de le retrouver. Les entrées du coffre sont chiffrées
et déchiffrées dans le navigateur ; le serveur ne stocke que des blocs opaques.

Sur l'appareil, l'extension conserve durablement l'adresse du serveur et le délai de
verrouillage. Les identifiants déchiffrés ne sont gardés qu'en mémoire, effacés au
verrouillage automatique, au verrouillage manuel ou à la fermeture du navigateur.
```

### Politique de confidentialité

AMO accepte un **texte**, pas seulement une URL — c'est celui-ci, et c'est aussi celui qui
devra être publié pour le Chrome Web Store, qui exige une URL :

```
GhostPass (extension navigateur) — politique de confidentialité

Les auteurs de l'extension ne reçoivent aucune donnée. L'extension ne contient ni mesure
d'audience, ni traceur, ni rapport d'erreur distant, et ne communique avec aucun serveur
que l'utilisateur n'a pas lui-même configuré.

CE QUI EST ENVOYÉ, ET À QUI
La seule destination réseau est l'instance GhostPass dont l'utilisateur a saisi l'adresse.
Lui sont envoyés : son adresse e-mail (identifiant de connexion), une empreinte dérivée de
son mot de passe maître (qui ne permet pas de le retrouver), et les blocs chiffrés de son
coffre. Cette instance peut être hébergée par l'utilisateur ou par un tiers de son choix ;
sa politique est alors celle de cet hébergeur.

CE QUI RESTE SUR L'APPAREIL
L'adresse du serveur et le délai de verrouillage, conservés tant que l'extension est
installée. Les identifiants déchiffrés, en mémoire seulement, effacés au verrouillage et à
la fermeture du navigateur.

CE QUI NE QUITTE JAMAIS L'APPAREIL
Le mot de passe maître et les clés de déchiffrement.

Questions : contact@stackops.ch
```

---

## 5. Notes pour les relecteurs

C'est le champ qui décide du délai d'examen. Il doit donner **de quoi reconstruire le
paquet** : AMO refuse le code minifié dont la source n'est pas fournie, et tout ce que
publie cette extension passe par Vite.

```
L'extension est construite (Vite + Svelte + TypeScript) et le cœur cryptographique est un
module WebAssembly. Le code source complet est joint, et le paquet se reconstruit à
l'identique avec :

  npm ci
  npm run build:firefox
  # le résultat est dans dist-firefox/ et correspond au .zip soumis

Environnement de construction :
  Node 22 LTS, npm 10
  macOS 15 ou Linux ; aucune dépendance système

LE SEUL AVERTISSEMENT DE web-ext lint
`web-ext lint` rend 0 erreur et 1 avertissement : UNSAFE_VAR_ASSIGNMENT (innerHTML) dans
assets/popup-*.js. Il vient du **runtime de Svelte**, qui construit ses fragments en
assignant un HTML **statique, produit à la compilation**, à un élément <template>. Il n'y a
aucun innerHTML dans src/, et aucune donnée d'utilisateur ni de page ne passe par là.

Le paquet ne contient aucun code distant. La directive 'wasm-unsafe-eval' de la CSP est
exigée par Manifest V3 pour compiler le module .wasm **inclus dans le paquet** ; script-src
reste 'self'.

Le module @stackops/ghostpass-crypto-wasm est publié sur un registre npm privé. Son archive
est jointe dans vendor/ et package.json y renvoie, afin que `npm ci` fonctionne sans aucun
accès à ce registre. Son propre code source (Rust) est dans vendor/source/ ; il se
reconstruit avec `wasm-pack build --target web`.

COMMENT ESSAYER L'EXTENSION
Elle a besoin d'un serveur GhostPass. Une instance de démonstration est à votre disposition :
  adresse  : <à remplir>
  compte   : <à remplir>
  mot de passe maître : <à remplir>
Indiquez l'adresse dans la page d'options, puis déverrouillez avec ce compte. Sans serveur,
le popup ne peut rien afficher.
```

> **La démonstration n'est pas facultative.** Un relecteur qui ne peut pas déverrouiller le
> coffre ne voit qu'un écran de connexion, et refuse faute de pouvoir vérifier ce que
> l'extension fait. Le compte doit être jetable et ne contenir que des entrées fictives.

---

## 6. Construire le paquet soumis

```bash
export NODE_AUTH_TOKEN="<jeton GitLab, scope read_api>"
npm ci
npm run build:firefox
npx web-ext lint --source-dir=dist-firefox      # doit passer sans erreur
cd dist-firefox && zip -r -FS ../artifacts/ghostpass-firefox-<version>.zip . && cd -
```

L'archive **source** à joindre est le dépôt sans `node_modules`, `dist`, `dist-firefox` ni
`artifacts`, plus le `vendor/` décrit au §5.

---

## 7. Ce qui manque encore

- [ ] **Captures d'écran** (AMO en accepte jusqu'à dix ; 1280×800 recommandé). Les mêmes
      scènes que la fiche App Store : le popup déverrouillé, le remplissage, les options.
      **À prendre sur un coffre fictif** — jamais sur un compte réel : voir l'incident des
      captures du site, 13 novembre 2026.
- [ ] **Compte de démonstration** pour les relecteurs (§5). Il en existe un sur
      `pass.ghostsuite.cloud` pour la revue d'Apple — neuf éléments, reconnexion vérifiée
      le 24 septembre 2026 (voir `ghostpass/docs/appstore.md`) — mais **ses identifiants ne
      sont écrits nulle part** dans les dépôts. Et avant de le donner à Mozilla, vérifier
      que ses neuf éléments sont bien fictifs : les captures du site, elles, portaient des
      données réelles jusqu'au 13 novembre 2026.
- [ ] **`vendor/`** : archive npm du cœur WASM et sa source Rust, pour que `npm ci`
      fonctionne sans le registre privé. L'archive existe —
      `stackops-ghostpass-crypto-wasm-0.0.1.tgz`, sha256
      `ed3abc768175f0430a660aa49a1e060a9ed6c2e1245ca692d1a4c29a8e229fe4`, 150 Ko — mais
      elle est sur le poste qui a le jeton, pas ici.
- [ ] Vérifier le numéro de version : `package.json` est à `0.1.0`, et AMO refuse de
      republier un numéro déjà soumis.

# Fiche Chrome Web Store — GhostPass

Tout ce que le tableau de bord du Store demande de saisir à la main **vit ici**, et non dans le
navigateur au moment de la soumission. Ce qui se crée en cliquant échappe au dépôt sans que
personne décide de l'en exclure : à la soumission suivante, ou à la première contestation d'un
relecteur, plus personne ne sait ce qui avait été déclaré ni pourquoi.

**Mode d'emploi** : copier-coller les blocs ci-dessous dans le tableau de bord. Si une réponse
doit changer pendant l'examen, la changer **ici d'abord**, puis dans le formulaire.

---

## 1. Identité de la fiche

| Champ | Valeur |
|---|---|
| Nom | `GhostPass` |
| Version | dérivée de `package.json` — voir `manifest.config.ts` |
| Catégorie | Outils (*Workflow & Planning* si la taxonomie l'impose) |
| Langue par défaut | Français |
| Paquet | `artifacts/ghostpass-chrome-<version>.zip`, produit par le job **Package** de la CI |

Le paquet **n'est jamais construit sur un poste**. Il est téléchargé depuis le run de CI du commit
que l'on publie ; son `sha256` accompagne l'archive. C'est la seule façon de répondre plus tard à
« le paquet en ligne, c'est quel commit ? ».

---

## 2. Description

> **La première ligne annonce la limite.** L'extension **lit et remplit ; elle n'enregistre rien**.
> Publier un gestionnaire de mots de passe qui ne sait pas enregistrer un mot de passe sans le dire
> dès la première phrase, c'est garantir les avis à une étoile — l'utilisateur découvrira le manque
> au moment précis où il en a besoin, en pleine création de compte.

**Résumé court** (132 caractères max) :

```
Consulte et remplit les identifiants de VOTRE serveur GhostPass. Lecture seule : cette version ne crée ni ne modifie d'entrée.
```

**Description longue** :

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
• Déverrouillage par e-mail et mot de passe maître (avec 2FA si votre instance l'exige)
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

Une fois le coffre déverrouillé, les identifiants déchiffrés vivent en mémoire dans le
service worker, jamais sur le disque, et sont effacés au verrouillage.

Logiciel libre, licence MIT.
```

---

## 3. Déclaration d'usage unique

Le Store impose qu'une extension serve **un seul objectif étroit**. Réponse à donner :

```
Consulter les identifiants stockés sur le serveur GhostPass auto-hébergé de l'utilisateur
et les saisir dans le formulaire de connexion de la page qu'il consulte.

Toutes les permissions demandées servent ce seul objectif. L'extension n'affiche pas de
publicité, ne collecte aucune statistique, ne modifie aucun contenu de page en dehors du
remplissage demandé, et ne communique avec aucun serveur autre que l'instance que
l'utilisateur a lui-même configurée.
```

---

## 4. Justification de chaque permission

À recopier champ par champ dans « Justification de l'utilisation des autorisations ».

### `storage`

```
Mémorise deux réglages, et rien d'autre : l'adresse du serveur GhostPass de l'utilisateur
et le délai de verrouillage automatique. Les identifiants déchiffrés ne sont jamais écrits
dans storage.local — ils vivent dans storage.session (mémoire seule, effacée à la fermeture
du navigateur), restreint aux contextes de confiance via setAccessLevel.
```

### `alarms`

```
Arme le verrouillage automatique du coffre après le délai d'inactivité choisi par
l'utilisateur. Sans cette permission, un coffre déverrouillé le resterait jusqu'à la
fermeture du navigateur. C'est la seule utilisation faite des alarmes.
```

### `activeTab`

```
Lit l'adresse de l'onglet actif pour remonter en tête de liste les identifiants du domaine
consulté, et sert de support à l'injection du remplissage. L'accès est accordé par le
navigateur uniquement lorsque l'utilisateur ouvre le popup et clique, et il expire ensuite.
L'extension n'a aucun accès permanent aux pages.
```

### `scripting`

```
Injecte, sur le clic « Remplir » et sur ce seul geste, une fonction autonome qui repère le
champ identifiant et le champ mot de passe du formulaire de connexion et y saisit la valeur
choisie. Il n'y a aucun content script déclaré dans le manifeste, donc aucun code exécuté
sur les pages en dehors de ce clic, et aucun remplissage automatique au chargement.
```

### `clipboardWrite`

```
Vide le presse-papiers 30 secondes après que l'utilisateur y a copié un mot de passe ou un
code à usage unique depuis le popup. L'extension n'écrit dans le presse-papiers que sur ce
geste de copie, puis pour l'effacer ; elle ne le lit jamais.
```

### `offscreen`

```
Un service worker ne peut pas écrire dans le presse-papiers. Pour l'effacer une fois le popup
fermé, l'extension ouvre un document hors écran, y efface le presse-papiers et le referme
aussitôt. C'est son seul usage.
```

### `optional_host_permissions: https://*/*`

C'est la demande qui attirera le plus l'attention du relecteur : le motif est large. La réponse
doit expliquer **pourquoi il ne peut pas être plus étroit**.

```
GhostPass est auto-hébergé : chaque utilisateur choisit le domaine de son serveur. Ce
domaine n'est pas connu au moment de la publication, et il n'existe aucun domaine que nous
pourrions déclarer à sa place.

Ce motif est OPTIONNEL et n'est jamais accordé à l'installation. Il n'est demandé qu'au
moment où l'utilisateur enregistre l'adresse de son instance dans la page d'options, et
chrome.permissions.request est alors appelé avec la SEULE origine qu'il vient de saisir
(par exemple https://vault.exemple.org/*) — jamais avec https://*/*. Le navigateur affiche
donc une demande portant sur ce seul domaine, et c'est ce seul domaine qui est accordé.

L'extension ne fait aucune requête réseau vers un autre hôte que celui-là.
```

> Cette explication doit rester vraie. Elle décrit `src/options/Options.svelte`, qui appelle
> `browser.permissions.request({ origins: [`${parsed.origin}/*`] })` avec l'origine saisie et
> refuse d'enregistrer si l'utilisateur décline. Toute évolution de ce code périme cette réponse.

### CSP : `'wasm-unsafe-eval'`

Le relecteur questionne systématiquement tout assouplissement de la CSP. Le manifeste porte déjà
la raison ; elle se recopie telle quelle :

```
Le cœur crypto est du WebAssembly : la CSP MV3 par défaut interdit sa compilation sans
'wasm-unsafe-eval'. Aucun code distant n'est jamais chargé.

Le module .wasm est inclus dans le paquet et chargé depuis lui. La directive script-src
reste 'self' : aucune source externe, aucun eval de chaîne, aucun code téléchargé à
l'exécution. C'est le seul moyen documenté d'exécuter du WebAssembly dans une page
d'extension MV3.
```

### Ce que l'extension ne demande PAS

Utile à mentionner en fin de justification, parce que c'est vérifiable dans le paquet :

```
Pas de content_scripts, pas de tabs, pas de webRequest, pas de cookies, pas de history,
pas de clipboardRead, pas de host_permissions accordées à l'installation.
```

---

## 5. Déclaration d'usage des données

Onglet « Confidentialité » → « Usage des données ». Réponses :

| Catégorie proposée par Google | Réponse | Pourquoi |
|---|---|---|
| Informations permettant d'identifier personnellement l'utilisateur | **Oui** — adresse e-mail | Elle sert d'identifiant de connexion et est envoyée au serveur de l'utilisateur |
| Informations sur l'état de santé | Non | |
| Informations financières et de paiement | Non | |
| Activité d'authentification | **Oui** — mots de passe | L'objet même du produit ; ils ne quittent jamais la machine en clair |
| Communications personnelles | Non | |
| Position | Non | |
| Historique de navigation | Non | |
| Activité utilisateur (clics, frappe, mouvements) | Non | |
| Contenu de sites web | Non | Seuls les champs du formulaire de connexion sont écrits, jamais lus ni transmis |

Trois cases à cocher, toutes les trois véridiques :

- ✅ **Je ne vends ni ne transfère les données à des tiers**, hors cas d'usage approuvés.
- ✅ **Je n'utilise ni ne transfère les données à des fins étrangères** à la fonction unique.
- ✅ **Je n'utilise ni ne transfère les données** pour évaluer la solvabilité ni à des fins de prêt.

Texte libre, si le formulaire en propose un :

```
Aucune donnée n'est transmise aux auteurs de l'extension, ni à aucun tiers. La seule
destination réseau est le serveur GhostPass que l'utilisateur a lui-même configuré.

Le mot de passe maître ne quitte jamais l'appareil : le serveur ne reçoit qu'une empreinte
dérivée localement, qui ne permet pas de le retrouver. Les entrées du coffre sont chiffrées
et déchiffrées dans le navigateur ; le serveur ne stocke que des blocs opaques.

Sur l'appareil, l'extension conserve durablement l'adresse du serveur et le délai de
verrouillage. Les identifiants déchiffrés ne sont gardés qu'en mémoire, effacés au
verrouillage automatique, au verrouillage manuel ou à la fermeture du navigateur.
```

**Politique de confidentialité** : le Store en exige l'URL dès lors qu'une donnée sensible est
déclarée — ce qui est le cas ici. *À fournir avant la première soumission ; cette ligne reste
ouverte tant qu'aucune URL n'existe.*

---

## 6. Ce qu'il reste à produire hors dépôt

Ces éléments sont des images ou des URL, et ne peuvent pas vivre dans ce fichier. Ils
manquent tant qu'ils ne sont pas cochés :

- [ ] URL de politique de confidentialité (obligatoire, voir §5)
- [ ] Au moins une capture d'écran 1280×800 ou 640×400
- [ ] Vignette 440×280 pour la vitrine
- [ ] Compte développeur Chrome Web Store (frais d'inscription unique)
- [ ] Vérification du domaine si la fiche renvoie vers un site

// Le script injecté dans les pages : il DÉTECTE et il PROPOSE, rien de plus.
//
// ─── Ce qu'il ne fait pas, et c'est le point ───
//
// Il ne reçoit jamais d'identifiant ni de mot de passe. Il demande au service
// worker « as-tu quelque chose pour cet hôte ? » et n'obtient qu'un NOMBRE. Le
// remplissage lui-même reste dans le service worker, qui l'injecte par
// `scripting` au moment du clic — exactement comme le fait déjà le bouton du
// popup.
//
// La distinction n'est pas théorique : ce fichier tourne dans le contexte de
// chaque page https, aux côtés du code du site. Tout secret qui y transiterait
// serait à la portée d'un script malveillant de la page, ou d'une extension
// tierce. Un nombre ne l'est pas.
//
// ─── Pourquoi il existe ───
//
// L'extension savait remplir, mais seulement si l'on cliquait sur son icône.
// Rien n'était injecté dans les pages, donc rien ne pouvait remarquer un
// formulaire de connexion ni proposer quoi que ce soit. Le remplissage était
// un geste qu'on déclenchait, jamais une offre — ce que tout gestionnaire
// comparable fait depuis dix ans.
//
// ─── Pourquoi la pastille est une `<button>` dans un shadow DOM ───
//
// Un shadow DOM ferme la page hors de nos styles ET nos styles hors de la
// page : un site qui redéfinit `button { display: none }` ne fait pas
// disparaître la proposition, et nos règles ne déforment pas son formulaire.
// Une vraie `<button>` garde le clavier et les lecteurs d'écran.

import { fillCredentialsInPage as remplir } from "./lib/remplir.js";

const MARQUE = "ghostpass-proposition";

// La silhouette du fantôme, copiée de `assets/logo/ghostpass-icon.svg`, qui est
// lui-même engendré par `tools/brand/ghost_suite.py`.
//
// Recopiée et non importée : un script de contenu ne peut pas charger une
// ressource de l'extension sans la déclarer en `web_accessible_resources`, ce
// qui la rendrait lisible par n'importe quelle page. Pour un tracé de 1,5 Kio,
// la déclaration coûte plus qu'elle ne rapporte.
const SILHOUETTE =
  "M 240.0 9.0 C 245.3 9.3 262.5 9.7 272.0 11.0 C 281.5 12.3 288.0 13.8 297.0 17.0 C 306.0 20.2 317.8 25.7 326.0 30.0 C 334.2 34.3 338.5 36.8 346.0 43.0 C 353.5 49.2 365.2 60.8 371.0 67.0 C 376.8 73.2 377.0 73.5 381.0 80.0 C 385.0 86.5 390.8 96.2 395.0 106.0 C 399.2 115.8 403.5 129.0 406.0 139.0 C 408.5 149.0 409.3 154.0 410.0 166.0 C 410.7 178.0 410.8 195.8 410.0 211.0 C 409.2 226.2 407.0 244.0 405.0 257.0 C 403.0 270.0 401.2 277.5 398.0 289.0 C 394.8 300.5 391.0 313.2 386.0 326.0 C 381.0 338.8 374.7 353.0 368.0 366.0 C 361.3 379.0 354.8 390.8 346.0 404.0 C 337.2 417.2 322.2 436.2 315.0 445.0 C 307.8 453.8 308.0 454.0 303.0 457.0 C 298.0 460.0 290.7 462.5 285.0 463.0 C 279.3 463.5 273.7 462.0 269.0 460.0 C 264.3 458.0 259.7 453.8 257.0 451.0 C 254.3 448.2 253.8 446.5 253.0 443.0 C 252.2 439.5 251.5 434.3 252.0 430.0 C 252.5 425.7 253.0 422.3 256.0 417.0 C 259.0 411.7 267.2 403.2 270.0 398.0 C 272.8 392.8 272.7 389.7 273.0 386.0 C 273.3 382.3 272.7 378.8 272.0 376.0 C 271.3 373.2 271.2 371.5 269.0 369.0 C 266.8 366.5 263.7 362.3 259.0 361.0 C 254.3 359.7 244.8 360.5 241.0 361.0 C 237.2 361.5 238.5 361.7 236.0 364.0 C 233.5 366.3 234.0 363.0 226.0 375.0 C 218.0 387.0 199.5 419.3 188.0 436.0 C 176.5 452.7 164.3 466.3 157.0 475.0 C 149.7 483.7 147.8 484.8 144.0 488.0 C 140.2 491.2 137.2 492.7 134.0 494.0 C 130.8 495.3 129.2 495.8 125.0 496.0 C 120.8 496.2 113.2 495.8 109.0 495.0 C 104.8 494.2 102.5 492.7 100.0 491.0 C 97.5 489.3 95.7 487.3 94.0 485.0 C 92.3 482.7 90.7 482.0 90.0 477.0 C 89.3 472.0 88.7 461.0 90.0 455.0 C 91.3 449.0 92.5 447.8 98.0 441.0 C 103.5 434.2 116.5 421.8 123.0 414.0 C 129.5 406.2 134.0 400.2 137.0 394.0 C 140.0 387.8 141.2 382.5 141.0 377.0 C 140.8 371.5 138.3 364.8 136.0 361.0 C 133.7 357.2 131.5 355.2 127.0 354.0 C 122.5 352.8 113.8 352.7 109.0 354.0 C 104.2 355.3 101.8 357.7 98.0 362.0 C 94.2 366.3 89.3 375.7 86.0 380.0 C 82.7 384.3 81.0 385.5 78.0 388.0 C 75.0 390.5 71.8 393.0 68.0 395.0 C 64.2 397.0 60.5 399.0 55.0 400.0 C 49.5 401.0 40.0 401.2 35.0 401.0 C 30.0 400.8 28.5 400.7 25.0 399.0 C 21.5 397.3 16.5 394.0 14.0 391.0 C 11.5 388.0 10.7 384.5 10.0 381.0 C 9.3 377.5 9.3 373.7 10.0 370.0 C 10.7 366.3 11.2 363.0 14.0 359.0 C 16.8 355.0 22.0 351.8 27.0 346.0 C 32.0 340.2 38.8 332.0 44.0 324.0 C 49.2 316.0 54.0 306.5 58.0 298.0 C 62.0 289.5 65.0 282.0 68.0 273.0 C 71.0 264.0 74.0 253.2 76.0 244.0 C 78.0 234.8 78.8 233.3 80.0 218.0 C 81.2 202.7 82.0 165.5 83.0 152.0 C 84.0 138.5 84.5 143.2 86.0 137.0 C 87.5 130.8 88.3 123.8 92.0 115.0 C 95.7 106.2 102.8 92.5 108.0 84.0 C 113.2 75.5 118.2 69.7 123.0 64.0 C 127.8 58.3 130.8 55.2 137.0 50.0 C 143.2 44.8 150.3 38.5 160.0 33.0 C 169.7 27.5 185.0 20.7 195.0 17.0 C 205.0 13.3 212.7 12.2 220.0 11.0 C 227.3 9.8 235.8 10.2 239.0 10.0 Z M 308 180 m -52 0 a 52 52 0 1 0 104 0 a 52 52 0 1 0 -104 0 Z M 308 180 m -22 0 a 22 22 0 1 0 44 0 a 22 22 0 1 0 -44 0 Z M 256 160 L 160 160 L 160 200 L 256 200 Z M 176 200 L 206 200 L 206 234 L 176 234 Z M 218 200 L 244 200 L 244 226 L 218 226 Z";

interface ReponseDeComptage {
  ok: boolean;
  nombre?: number;
  verrouille?: boolean;
}

/** Le champ de mot de passe visible le plus proche du haut, ou `null`. */
function champDeMotDePasse(): HTMLInputElement | null {
  const champs = [...document.querySelectorAll<HTMLInputElement>('input[type="password"]')];
  return (
    champs.find((c) => {
      const boite = c.getBoundingClientRect();
      // Un champ de taille nulle est un leurre, un champ caché, ou un
      // formulaire d'inscription replié. Proposer dessus place la pastille
      // dans un coin, sur une page où l'on ne se connecte pas.
      return boite.width > 0 && boite.height > 0;
    }) ?? null
  );
}

function deja(): boolean {
  return document.querySelector(MARQUE) !== null;
}

function poserLaPastille(champ: HTMLInputElement, nombre: number): void {
  if (deja()) return;

  const hote = document.createElement(MARQUE);
  hote.style.cssText = "position:absolute;z-index:2147483647;";
  const racine = hote.attachShadow({ mode: "closed" });

  const bouton = document.createElement("button");
  bouton.type = "button";
  // L'ICÔNE du produit, comme le font Bitwarden et Dashlane, et non un bouton
  // bleu avec un verbe. Une pastille « Choisir (3) » ne dit pas de QUI elle
  // vient : sur un formulaire de connexion, un bouton inconnu qui propose de
  // remplir des identifiants est au mieux déroutant.
  //
  // La silhouette plutôt que le logo au trait : le trait fait 4 % de la
  // hauteur et disparaît en dessous de 16 px, ce que la charte a déjà mesuré.
  const icone = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icone.setAttribute("viewBox", "-63.5 0 548 548");
  icone.setAttribute("width", "14");
  icone.setAttribute("height", "14");
  icone.setAttribute("aria-hidden", "true");
  const trace = document.createElementNS("http://www.w3.org/2000/svg", "path");
  trace.setAttribute("fill", "currentColor");
  trace.setAttribute("d", SILHOUETTE);
  icone.appendChild(trace);
  // « Choisir » et non « Remplir » quand il y en a plusieurs : le clic ouvrira
  // GhostPass pour qu'on tranche, il ne remplira rien. Promettre « Remplir »
  // puis ne pas remplir est ce que Kevin a vu — un bouton qui ment.
  const compte = document.createElement("span");
  // Le NOMBRE seul quand il y en a plusieurs, à côté de l'icône. Le verbe
  // n'apporte rien : l'icône dit qui propose, le chiffre dit combien.
  compte.textContent = nombre > 1 ? String(nombre) : "";
  bouton.setAttribute(
    "aria-label",
    nombre > 1
      ? `GhostPass : ${nombre} identifiants pour ce site`
      : "GhostPass : remplir cet identifiant",
  );
  bouton.append(icone, compte);
  bouton.style.cssText = [
    "all:unset",
    "box-sizing:border-box",
    "cursor:pointer",
    "display:inline-flex",
    "align-items:center",
    "gap:3px",
    "font:600 11px/1 system-ui,sans-serif",
    "padding:4px 6px",
    "border-radius:6px",
    // Discrète sur un formulaire qui n'est pas le nôtre : un fond très clair
    // et l'encre du produit, plutôt qu'un aplat de couleur vive. C'est la
    // retenue qu'observent les gestionnaires comparables.
    "background:rgba(31,111,235,.10)",
    "color:#1f6feb",
  ].join(";");

  bouton.addEventListener("click", () => {
    bouton.disabled = true;
    bouton.replaceChildren(document.createTextNode("…"));
    // Le service worker remplit. Ce script ne voit toujours aucun secret.
    // On demande l'identifiant, et on remplit ICI.
    //
    // `scripting.executeScript` depuis le service worker échouait sur
    // « Cannot access contents of the page » : un clic sur une pastille DANS
    // la page n'accorde pas `activeTab`, contrairement à un clic sur l'icône
    // de la barre d'outils. Chrome a raison de refuser ; c'est mon chemin qui
    // était faux.
    chrome.runtime.sendMessage(
      { type: "credentialForFill" },
      (r: {
        ok?: boolean;
        cred?: { username: string; password: string };
        plusieurs?: number;
        error?: string;
      }) => {
        if (r?.ok && r.cred) {
          const fait = remplir(r.cred);
          bouton.replaceChildren(
            document.createTextNode(fait.password ? "Rempli" : "Champ introuvable"),
          );
          setTimeout(() => hote.remove(), 1200);
          return;
        }
        if (r?.plusieurs) {
          // Plusieurs candidats : le popup les montre et laisse choisir. On
          // n'en prend aucun — remplir au hasard poserait le mauvais compte
          // sans le dire.
          chrome.runtime.sendMessage({ type: "fillActiveTab" }, () => {
            hote.remove();
          });
          return;
        }
        // La RAISON, et non « Échec ». Un bouton qui échoue sans dire pourquoi
        // laisse chercher ; celui-ci disait « Échec » alors qu'il y avait
        // simplement trois identifiants et qu'il fallait en choisir un.
        bouton.replaceChildren(document.createTextNode(r?.error ?? "Échec"));
        bouton.style.background = "#8a2020";
        bouton.style.maxWidth = "min(22rem, 60vw)";
        bouton.style.whiteSpace = "normal";
        bouton.style.textAlign = "left";
        setTimeout(() => hote.remove(), 4000);
      },
    );
  });

  racine.appendChild(bouton);
  document.body.appendChild(hote);

  // Mesurer exige que l'élément soit DANS le document : avant, toutes ses
  // dimensions valent zéro et la pastille se pose au mauvais endroit.
  const placer = () => {
    const champBoite = champ.getBoundingClientRect();
    // La largeur RÉELLE du bouton, mesurée après insertion. Elle était écrite
    // en dur à 74 px, et « Choisir (3) » est plus large : la pastille
    // débordait hors du champ, à cheval sur sa bordure.
    const pastille = bouton.getBoundingClientRect();
    const marge = 6;
    hote.style.left = `${window.scrollX + champBoite.right - pastille.width - marge}px`;
    hote.style.top = `${
      window.scrollY + champBoite.top + (champBoite.height - pastille.height) / 2
    }px`;
  };
  placer();
  window.addEventListener("scroll", placer, { passive: true });
  window.addEventListener("resize", placer, { passive: true });

  // Dès que la personne tape, la proposition s'efface.
  //
  // Elle est posée PAR-DESSUS le champ : laissée là, elle masquerait la fin
  // d'un mot de passe long. Et quelqu'un qui tape a déjà répondu à la question
  // qu'elle posait.
  champ.addEventListener("input", () => hote.remove(), { once: true });
}

async function regarder(): Promise<void> {
  if (deja()) return;
  const champ = champDeMotDePasse();
  if (!champ) return;

  const reponse: ReponseDeComptage = await chrome.runtime.sendMessage({
    type: "countForHost",
    host: location.hostname,
  });
  // Coffre verrouillé ou aucun identifiant : on ne propose RIEN. Une pastille
  // qui mène à « déverrouillez d'abord » ajoute une étape sans rien apporter,
  // sur chaque page de connexion du web.
  if (!reponse?.ok || !reponse.nombre) return;

  poserLaPastille(champ, reponse.nombre);
}

// Les formulaires arrivent souvent APRÈS le chargement — applications à page
// unique, modales de connexion, champs révélés par un bouton. Un seul passage
// au chargement en manquerait la plupart.
const observateur = new MutationObserver(() => {
  void regarder();
});
observateur.observe(document.documentElement, { childList: true, subtree: true });
void regarder();

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

const MARQUE = "ghostpass-proposition";

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
  // « Choisir » et non « Remplir » quand il y en a plusieurs : le clic ouvrira
  // GhostPass pour qu'on tranche, il ne remplira rien. Promettre « Remplir »
  // puis ne pas remplir est ce que Kevin a vu — un bouton qui ment.
  bouton.textContent = nombre > 1 ? `Choisir (${nombre})` : "Remplir";
  bouton.setAttribute(
    "aria-label",
    nombre > 1
      ? `GhostPass : ${nombre} identifiants pour ce site`
      : "GhostPass : remplir cet identifiant",
  );
  bouton.style.cssText = [
    "all:unset",
    "box-sizing:border-box",
    "cursor:pointer",
    "font:600 11px/1 system-ui,sans-serif",
    "padding:5px 9px",
    "border-radius:9999px",
    "background:#1f6feb",
    "color:#fff",
    "box-shadow:0 1px 4px rgba(0,0,0,.3)",
  ].join(";");

  bouton.addEventListener("click", () => {
    bouton.disabled = true;
    bouton.textContent = "…";
    // Le service worker remplit. Ce script ne voit toujours aucun secret.
    chrome.runtime.sendMessage(
      { type: "fillActiveTab" },
      (r: { ok?: boolean; error?: string }) => {
        if (r?.ok) {
          bouton.textContent = "Rempli";
          setTimeout(() => hote.remove(), 1200);
          return;
        }
        // La RAISON, et non « Échec ». Un bouton qui échoue sans dire pourquoi
        // laisse chercher ; celui-ci disait « Échec » alors qu'il y avait
        // simplement trois identifiants et qu'il fallait en choisir un.
        bouton.textContent = r?.error ?? "Échec";
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

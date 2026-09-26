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
  bouton.textContent = nombre > 1 ? `Remplir (${nombre})` : "Remplir";
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
    "font:600 12px/1 system-ui,sans-serif",
    "padding:6px 10px",
    "border-radius:9999px",
    "background:#1f6feb",
    "color:#fff",
    "box-shadow:0 1px 4px rgba(0,0,0,.3)",
  ].join(";");

  bouton.addEventListener("click", () => {
    bouton.disabled = true;
    bouton.textContent = "…";
    // Le service worker remplit. Ce script ne voit toujours aucun secret.
    chrome.runtime.sendMessage({ type: "fillActiveTab" }, (r: { ok?: boolean }) => {
      bouton.textContent = r?.ok ? "Rempli" : "Échec";
      setTimeout(() => hote.remove(), 1200);
    });
  });

  racine.appendChild(bouton);
  document.body.appendChild(hote);

  const placer = () => {
    const b = champ.getBoundingClientRect();
    // Collée au bord droit du champ, à l'intérieur. `scrollX/Y` parce que la
    // pastille est en `absolute` dans le document, pas dans la fenêtre.
    hote.style.left = `${window.scrollX + b.right - 74}px`;
    hote.style.top = `${window.scrollY + b.top + (b.height - 26) / 2}px`;
  };
  placer();
  window.addEventListener("scroll", placer, { passive: true });
  window.addEventListener("resize", placer, { passive: true });
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

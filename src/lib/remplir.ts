// Le remplissage d'un formulaire, écrit une fois pour deux appelants.
//
// Il vit ici parce que DEUX chemins l'utilisent, et qu'ils n'ont pas les mêmes
// droits :
//
//   * le popup, qui passe par `scripting.executeScript`. Le clic sur l'icône
//     de la barre d'outils accorde `activeTab`, donc la permission d'hôte ;
//   * le script de contenu, qui remplit LUI-MÊME. Un clic sur une pastille
//     DANS la page n'accorde pas `activeTab` — `executeScript` échouait alors
//     sur « Cannot access contents of the page », ce qui est exactement ce que
//     Chrome doit répondre, et que j'avais manqué.
//
// Le second chemin suppose que le script de contenu reçoive l'identifiant. Ce
// n'est pas le relâchement qu'il paraît : un script de contenu tourne dans un
// MONDE ISOLÉ, et les scripts de la page ne peuvent pas lire ses variables. La
// valeur finit de toute façon dans le champ, où la page la voit — c'est
// inhérent au remplissage automatique, chez tout le monde.
//
// Le vrai garde est ailleurs, dans le service worker : il ne rend un
// identifiant que si l'hôte de l'onglet APPELANT correspond à une adresse
// enregistrée sur cet élément.

export function fillCredentialsInPage(cred: { username: string; password: string }): {
  username: boolean;
  password: boolean;
} {
  const visible = (el: HTMLInputElement) =>
    el.offsetParent !== null && !el.disabled && !el.readOnly && el.type !== "hidden";
  const setValue = (el: HTMLInputElement | null, value: string) => {
    if (!el || !value) return false;
    el.focus();
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  const pw = [...document.querySelectorAll<HTMLInputElement>('input[type="password"]')].find(visible) ?? null;

  // Identifiant : d'abord dans le formulaire du mot de passe, sinon à l'échelle de la page.
  const scope = pw?.form
    ? [...pw.form.querySelectorAll<HTMLInputElement>("input")].filter(visible)
    : [...document.querySelectorAll<HTMLInputElement>("input")].filter(visible);
  const hint = (i: HTMLInputElement) => `${i.autocomplete} ${i.name} ${i.id}`.toLowerCase();
  let user =
    scope.find((i) => (i.autocomplete || "").toLowerCase() === "username") ??
    scope.find((i) => i.type === "email") ??
    scope.find((i) => /user|email|login|mail/.test(hint(i))) ??
    null;
  // Sinon : dernier champ texte visible précédant le mot de passe.
  if (!user && pw) {
    const before = scope.slice(0, scope.indexOf(pw));
    user = before.reverse().find((i) => ["text", "email", "tel"].includes(i.type)) ?? null;
  }
  // Page sans mot de passe (identifiant d'abord) : premier champ texte/email visible.
  if (!user && !pw) {
    user = scope.find((i) => ["text", "email", "tel"].includes(i.type)) ?? null;
  }

  return { username: setValue(user, cred.username), password: setValue(pw, cred.password) };
}

// Document hors écran (Chrome) : le seul endroit d'où un service worker peut écrire dans le
// presse-papiers. Il n'existe que le temps d'effacer, puis le service worker le referme.
//
// `navigator.clipboard` exige une page qui a le focus, ce qu'un document hors écran n'a jamais :
// on passe par `execCommand("copy")` et on remplace, dans l'événement `copy`, le contenu par une
// chaîne vide.
import { browser } from "../lib/browser.js";

function clearClipboard(): boolean {
  const onCopy = (e: ClipboardEvent) => {
    e.clipboardData?.setData("text/plain", "");
    e.preventDefault();
  };
  document.addEventListener("copy", onCopy);
  try {
    return document.execCommand("copy");
  } finally {
    document.removeEventListener("copy", onCopy);
  }
}

browser.runtime.onMessage.addListener((message: { target?: string; type?: string }, _s, reply) => {
  if (message?.target !== "offscreen" || message.type !== "clearClipboard") return false;
  reply({ ok: clearClipboard() });
  return false;
});

// Service worker (Manifest V3). Minimal pour l'instant : point d'extension pour les évolutions
// (autofill, verrouillage auto, messagerie content script ↔ popup).
chrome.runtime.onInstalled.addListener(() => {
  console.info("GhostPass extension installée.");
});

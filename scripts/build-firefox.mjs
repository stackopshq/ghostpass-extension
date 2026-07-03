// Produit le build Firefox à partir du build Chrome (`dist/`, généré par @crxjs).
//
// Deux ajustements suffisent : Firefox veut un `browser_specific_settings.gecko.id` et un
// background en **event page module** (`background.scripts`) plutôt qu'un `service_worker`
// (Chromium). Le reste du code est identique (`chrome.*` est aliasé sur Firefox).
import { cpSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const SRC = "dist";
const OUT = "dist-firefox";

rmSync(OUT, { recursive: true, force: true });
cpSync(SRC, OUT, { recursive: true });

const manifestPath = `${OUT}/manifest.json`;
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

manifest.browser_specific_settings = {
  ...manifest.browser_specific_settings,
  gecko: { id: "ghostpass@stackops.hq", strict_min_version: "128.0" },
};

const serviceWorker = manifest.background?.service_worker;
if (serviceWorker) {
  manifest.background = { scripts: [serviceWorker], type: "module" };
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Firefox build → ${OUT}/ (background.scripts, gecko id)`);

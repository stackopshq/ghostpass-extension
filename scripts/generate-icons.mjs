// Produit les icônes PNG de l'extension à partir d'UNE source vectorielle.
//
// **Pourquoi une source à part du logo.** `assets/logo/ghostpass.svg` est la variante *logo* de
// la charte ghost-suite : un tracé de 22 unités sur 548, soit 4 % de la hauteur. À 16 px — la
// taille à laquelle une icône d'extension est réellement regardée, dans la barre d'outils — cela
// fait six dixièmes de pixel, et le trait disparaît : il ne reste qu'une tache pâle. La variante
// *icône* (`assets/logo/ghostpass-icon.svg`) est la même silhouette **remplie**, le glyphe creusé,
// les tirets détachés abandonnés parce qu'ils ne produisent que du bruit à cette taille.
//
// Les deux SVG sont produits par `tools/brand/ghost_suite.py` du dépôt apollo-platform ; celui-ci
// est vendoré ici pour que le dépôt sache refaire ses propres icônes sans dépendre d'un autre.
// Retoucher un PNG à la main le rend faux à la prochaine exécution, et personne ne le remarque
// avant de le voir dans un onglet.
import { Resvg } from "@resvg/resvg-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "assets", "logo", "ghostpass-icon.svg");
const outDir = join(root, "assets", "logo");

// 128 est exigé par le Chrome Web Store ; 48 sert la page chrome://extensions ; 16 et 32 la barre
// d'outils selon la densité d'écran. 192 n'est pas utilisé par le manifeste — il est conservé pour
// les usages hors extension (README, fiche du Store) et régénéré ici pour rester cohérent.
const SIZES = [16, 32, 48, 128, 192];

const svg = readFileSync(source, "utf8");
mkdirSync(outDir, { recursive: true });

for (const size of SIZES) {
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "rgba(0,0,0,0)",
  })
    .render()
    .asPng();
  const out = join(outDir, `icon-${size}.png`);
  writeFileSync(out, png);
  console.log(`  icon-${size}.png  (${png.length} o)`);
}

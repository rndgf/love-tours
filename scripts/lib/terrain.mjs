/**
 * MNT (modèle numérique de terrain) pour les bandes hypsométriques des cartes.
 * Tuiles « terrarium » AWS mises en cache dans data/terrain/ (versionné) :
 * une fois le cache rempli, tout est hors ligne et déterministe.
 * Partagé entre gen-minimaps.mjs et gen-background.mjs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { contours as d3contours } from "d3-contour";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TERRAIN_DIR = path.join(ROOT, "data/terrain");
const TERRAIN_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";

// Seuils communs à toutes les cartes : même teinte = même altitude.
export const HYPSO_M = [60, 120, 180];

const mercator = (lon, lat, z) => {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  return [
    ((lon + 180) / 360) * n,
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  ];
};

async function terrainTile(z, x, y) {
  fs.mkdirSync(TERRAIN_DIR, { recursive: true });
  const file = path.join(TERRAIN_DIR, `${z}-${x}-${y}.png`);
  if (!fs.existsSync(file)) {
    const res = await fetch(`${TERRAIN_URL}/${z}/${x}/${y}.png`);
    if (!res.ok) throw new Error(`tuile terrain ${z}/${x}/${y} : HTTP ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  return { data, ch: info.channels, w: info.width };
}

/**
 * Contours hypsométriques d'un cadre [minLon, minLat, maxLon, maxLat].
 * Retourne { N, bands: [{ level, rings: [[[gx, gy], …], …] }] } — anneaux en
 * coordonnées de grille (x : 0..N vers l'est, y : 0..N vers le sud), à
 * projeter par l'appelant. Zoom adaptatif : ~3 tuiles sur la largeur.
 */
export async function hypsoBands(frame, midLatRad, sideKm, N = 100) {
  const z = Math.max(6, Math.min(11, Math.round(Math.log2((40075 * Math.cos(midLatRad) * 3) / sideKm))));
  const tiles = new Map();
  const [x0, yMax] = mercator(frame[0], frame[1], z);
  const [x1, yMin] = mercator(frame[2], frame[3], z);
  for (let tx = Math.floor(x0); tx <= Math.floor(x1); tx++) {
    for (let ty = Math.floor(yMin); ty <= Math.floor(yMax); ty++) {
      tiles.set(`${tx}/${ty}`, await terrainTile(z, tx, ty));
    }
  }
  const elevation = (lon, lat) => {
    const [mx, my] = mercator(lon, lat, z);
    const t = tiles.get(`${Math.floor(mx)}/${Math.floor(my)}`);
    if (!t) return 0;
    const px = Math.min(t.w - 1, Math.floor((mx - Math.floor(mx)) * t.w));
    const py = Math.min(t.w - 1, Math.floor((my - Math.floor(my)) * t.w));
    const i = (py * t.w + px) * t.ch;
    return t.data[i] * 256 + t.data[i + 1] + t.data[i + 2] / 256 - 32768;
  };
  // Altitude d'une cellule = max de 3×3 sous-échantillons : une crête étroite
  // (dunes, falaises) plus fine que la cellule n'est pas ratée.
  const values = new Float64Array(N * N);
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      let m = -Infinity;
      for (let sy = 0; sy < 3; sy++) {
        const lat = frame[3] - ((row + (sy + 0.5) / 3) / N) * (frame[3] - frame[1]);
        for (let sx = 0; sx < 3; sx++) {
          const lon = frame[0] + ((col + (sx + 0.5) / 3) / N) * (frame[2] - frame[0]);
          const e = elevation(lon, lat);
          if (e > m) m = e;
        }
      }
      values[row * N + col] = m;
    }
  }
  const bands = d3contours().size([N, N]).thresholds(HYPSO_M)(values)
    .map((band) => ({ level: band.value, rings: band.coordinates.flatMap((poly) => poly) }));
  return { N, bands };
}

#!/usr/bin/env node
/**
 * Génère src/data/minimaps/<slug>.json : mini-carte réelle par édition pour les
 * cartouches de la homepage — terre/mer Natural Earth 10m découpées autour de
 * la trace, trace projetée, échelle graphique.
 *
 * Coordonnées de sortie : viewBox 0-100 (y vers le bas).
 * Usage : node scripts/gen-minimaps.mjs <dossier natural-earth>
 *         (attend land10.geojson et coast10.geojson dans ce dossier)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { distM, LOOP_MAX_M } from "../src/lib/geo.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NE_DIR = process.argv[2] ?? path.join(ROOT, "data/naturalearth");

for (const f of ["land10.geojson", "coast10.geojson"]) {
  if (!fs.existsSync(path.join(NE_DIR, f))) {
    console.error(
      `Données Natural Earth absentes : ${path.join(NE_DIR, f)}\n` +
      `Télécharger ne_10m_land et ne_10m_coastline sur naturalearthdata.com,\n` +
      `convertir en GeoJSON (land10.geojson, coast10.geojson) dans ${NE_DIR}/ (dossier hors dépôt).`,
    );
    process.exit(1);
  }
}

const KM_PER_DEG = 111.32;
// Marge autour de la trace (fraction du plus grand côté).
const MARGIN = 0.22;

const land = JSON.parse(fs.readFileSync(path.join(NE_DIR, "land10.geojson"), "utf8"));
const coast = JSON.parse(fs.readFileSync(path.join(NE_DIR, "coast10.geojson"), "utf8"));

const landRings = land.features.flatMap((f) => {
  const g = f.geometry;
  if (g.type === "Polygon") return [g.coordinates[0]];
  if (g.type === "MultiPolygon") return g.coordinates.map((p) => p[0]);
  return [];
});
const coastLines = coast.features.flatMap((f) => {
  const g = f.geometry;
  if (g.type === "LineString") return [g.coordinates];
  if (g.type === "MultiLineString") return g.coordinates;
  return [];
});

/** Sutherland-Hodgman : intersection polygone × rectangle [x0,y0,x1,y1]. */
function clipPolygon(ring, [x0, y0, x1, y1]) {
  const edges = [
    (p) => p[0] >= x0, (p) => p[0] <= x1,
    (p) => p[1] >= y0, (p) => p[1] <= y1,
  ];
  const inters = [
    (a, b) => [x0, a[1] + ((x0 - a[0]) * (b[1] - a[1])) / (b[0] - a[0])],
    (a, b) => [x1, a[1] + ((x1 - a[0]) * (b[1] - a[1])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((y0 - a[1]) * (b[0] - a[0])) / (b[1] - a[1]), y0],
    (a, b) => [a[0] + ((y1 - a[1]) * (b[0] - a[0])) / (b[1] - a[1]), y1],
  ];
  let poly = ring;
  for (let e = 0; e < 4; e++) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ain = edges[e](a), bin = edges[e](b);
      if (ain && bin) out.push(b);
      else if (ain && !bin) out.push(inters[e](a, b));
      else if (!ain && bin) { out.push(inters[e](a, b)); out.push(b); }
    }
    poly = out;
    if (!poly.length) return [];
  }
  return poly;
}

function clipLine(coords, [x0, y0, x1, y1]) {
  const runs = [];
  let cur = [];
  for (const [x, y] of coords) {
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) cur.push([x, y]);
    else if (cur.length) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  return runs.filter((r) => r.length > 1);
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    if (j - i < 2) continue;
    const [x1, y1] = pts[i], [x2, y2] = pts[j];
    const dx = x2 - x1, dy = y2 - y1;
    const n = Math.hypot(dx, dy);
    let bd = -1, bk = i;
    for (let k = i + 1; k < j; k++) {
      const d = n === 0
        ? Math.hypot(pts[k][0] - x1, pts[k][1] - y1)
        : Math.abs(dy * (pts[k][0] - x1) - dx * (pts[k][1] - y1)) / n;
      if (d > bd) { bd = d; bk = k; }
    }
    if (bd > eps) { keep[bk] = 1; stack.push([i, bk], [bk, j]); }
  }
  return pts.filter((_, i) => keep[i]);
}

fs.mkdirSync(path.join(ROOT, "src/data/minimaps"), { recursive: true });

for (const file of fs.readdirSync(path.join(ROOT, "public/tours")).filter((f) => f.endsWith(".geojson"))) {
  const slug = file.replace(".geojson", "");
  const g = JSON.parse(fs.readFileSync(path.join(ROOT, "public/tours", file), "utf8"));
  const segs = g.features.filter((f) => !f.properties?.transfer).flatMap((f) =>
    f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [f.geometry.coordinates]);
  const all = segs.flat();

  // Cadre : bbox de la trace + marge, ramené au carré (en km).
  const lons = all.map((c) => c[0]), lats = all.map((c) => c[1]);
  const lat0 = ((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI / 180;
  const cos0 = Math.cos(lat0);
  const wKm = (Math.max(...lons) - Math.min(...lons)) * KM_PER_DEG * cos0;
  const hKm = (Math.max(...lats) - Math.min(...lats)) * KM_PER_DEG;
  const sideKm = Math.max(wKm, hKm) * (1 + 2 * MARGIN);
  const cLon = (Math.min(...lons) + Math.max(...lons)) / 2;
  const cLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const halfLon = sideKm / 2 / (KM_PER_DEG * cos0);
  const halfLat = sideKm / 2 / KM_PER_DEG;
  const frame = [cLon - halfLon, cLat - halfLat, cLon + halfLon, cLat + halfLat];

  const px = (lon) => ((lon - frame[0]) / (2 * halfLon)) * 100;
  const py = (lat) => ((frame[3] - lat) / (2 * halfLat)) * 100;
  const toD = (coords, eps) =>
    rdp(coords.map((c) => [px(c[0]), py(c[1])]), eps)
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join("");

  const landPaths = landRings
    .map((r) => clipPolygon(r, frame))
    .filter((r) => r.length > 2)
    .map((r) => toD(r, 0.25) + "Z");
  const coastPaths = coastLines
    .flatMap((l) => clipLine(l, frame))
    .map((run) => toD(run, 0.25))
    .filter((d) => d.length > 10);
  const tracePaths = segs.map((s) => toD(s, 0.35));

  // Échelle graphique : segment rond (5/10/20/50 km) ≈ 25 unités de large max.
  const kmPerUnit = sideKm / 100;
  const scaleKm = [100, 50, 20, 10, 5].find((k) => k / kmPerUnit <= 28) ?? 5;
  const scaleUnits = +(scaleKm / kmPerUnit).toFixed(1);

  const startLL = segs[0][0];
  const endLL = segs.at(-1).at(-1);
  const out = { land: landPaths, coast: coastPaths, trace: tracePaths,
    start: [ +px(startLL[0]).toFixed(1), +py(startLL[1]).toFixed(1) ],
    end: [ +px(endLL[0]).toFixed(1), +py(endLL[1]).toFixed(1) ],
    // Boucle (départ ≈ arrivée) : le composant affiche alors un marqueur combiné.
    loop: distM(startLL, endLL) < LOOP_MAX_M,
    scaleKm, scaleUnits };
  fs.writeFileSync(path.join(ROOT, `src/data/minimaps/${slug}.json`), JSON.stringify(out));
  console.log(`✓ ${slug} : ${landPaths.length} terres, ${coastPaths.length} côtes, cadre ${Math.round(sideKm)} km, échelle ${scaleKm} km`);
}

#!/usr/bin/env node
/**
 * Génère src/components/BackgroundMap.astro : carte réelle en filigrane,
 * centrée sur la maison (Sotteville-lès-Rouen), avec trait de côte et fleuves
 * Natural Earth + les vraies traces des Love Tours.
 *
 * Entrées (téléchargées dans le scratchpad) :
 *   coast10.geojson  (ne_10m_coastline)
 *   rivers10.geojson (ne_10m_rivers_lake_centerlines)
 * Usage : node scripts/gen-background.mjs <dossier-geojson-natural-earth>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isBike } from "../src/lib/mode.js";
import { hypsoBands } from "./lib/terrain.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NE_DIR = process.argv[2] ?? path.join(ROOT, "data/naturalearth");

for (const f of ["coast10.geojson", "rivers10.geojson"]) {
  if (!fs.existsSync(path.join(NE_DIR, f))) {
    console.error(
      `Données Natural Earth absentes : ${path.join(NE_DIR, f)}\n` +
      `Télécharger ne_10m_coastline et ne_10m_rivers_lake_centerlines sur naturalearthdata.com,\n` +
      `convertir en GeoJSON (coast10.geojson, rivers10.geojson) dans ${NE_DIR}/ (dossier hors dépôt).`,
    );
    process.exit(1);
  }
}


// Centre de la vue : milieu de l'étendue globale des traces (union des bbox
// des 5 éditions) — le dessin est ainsi visuellement centré, la maison reste
// dans le champ.
function tourCenter() {
  const dir = path.join(ROOT, "public/tours");
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".geojson"))) {
    const g = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const feat of g.features ?? []) {
      const geom = feat.geometry;
      const lines = geom.type === "MultiLineString" ? geom.coordinates : [geom.coordinates];
      for (const line of lines) for (const [lon, lat] of line) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return { lon: (minLon + maxLon) / 2, lat: (minLat + maxLat) / 2 };
}
const CENTER = tourCenter();

// Étendue : ±4.5° de longitude et ±2.8° de latitude autour du centre
// (couvre Loire, Bretagne, Cotentin, Sussex et Zélande).
const HALF_LON = 4.5, HALF_LAT = 2.8;
const BBOX = [CENTER.lon - HALF_LON, CENTER.lat - HALF_LAT, CENTER.lon + HALF_LON, CENTER.lat + HALF_LAT];

const KM_PER_DEG = 111.32;
const COS0 = Math.cos((CENTER.lat * Math.PI) / 180);
const W = 2 * HALF_LON * KM_PER_DEG * COS0;
const H = 2 * HALF_LAT * KM_PER_DEG;
const SCALE = 2; // km → unités SVG

const px = (lon) => ((lon - BBOX[0]) * KM_PER_DEG * COS0 * SCALE).toFixed(1);
const py = (lat) => ((BBOX[3] - lat) * KM_PER_DEG * SCALE).toFixed(1);

const inBbox = ([lon, lat]) =>
  lon >= BBOX[0] && lon <= BBOX[2] && lat >= BBOX[1] && lat <= BBOX[3];

/** Découpe une polyligne en tronçons entièrement dans la bbox. */
function clip(coords) {
  const runs = [];
  let cur = [];
  for (const c of coords) {
    if (inBbox(c)) cur.push(c);
    else if (cur.length) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  return runs.filter((r) => r.length > 1);
}

/** RDP en espace écran (tolérance en unités SVG). */
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
      const [x0, y0] = pts[k];
      const d = n === 0 ? Math.hypot(x0 - x1, y0 - y1) : Math.abs(dy * (x0 - x1) - dx * (y0 - y1)) / n;
      if (d > bd) { bd = d; bk = k; }
    }
    if (bd > eps) { keep[bk] = 1; stack.push([i, bk], [bk, j]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const toPath = (coords, eps) => {
  const pts = rdp(coords.map((c) => [+px(c[0]), +py(c[1])]), eps);
  return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
};

function extractLines(geojson) {
  const lines = [];
  for (const f of geojson.features) {
    if (f.properties?.transfer) continue;
    const g = f.geometry;
    if (!g) continue;
    const arrs = g.type === "LineString" ? [g.coordinates]
      : g.type === "MultiLineString" ? g.coordinates : [];
    for (const a of arrs) lines.push({ props: f.properties ?? {}, coords: a });
  }
  return lines;
}

// Nuances topographiques : bandes hypsométriques très pâles sous le dessin.
// Grille grossière + simplification forte : c'est un filigrane, et le SVG est
// inliné dans chaque page — le poids prime sur le détail.
const { N: HYPSO_N, bands: hypso } = await hypsoBands(BBOX, (CENTER.lat * Math.PI) / 180, W, 120);
const gx2svg = (gx) => (gx / HYPSO_N) * (W * SCALE);
const gy2svg = (gy) => (gy / HYPSO_N) * (H * SCALE);
const ringBboxSpan = (pts) => {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};
const hypsoPaths = hypso.map(({ level, rings }) => ({
  level,
  d: rings
    .map((ring) => {
      const pts = rdp(ring.map(([x, y]) => [gx2svg(x), gy2svg(y)]), 4.5);
      if (pts.length < 4 || ringBboxSpan(pts) < 24) return "";
      return pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${Math.round(x)},${Math.round(y)}`).join("") + "Z";
    })
    .filter(Boolean)
    .join(""),
})).filter((b) => b.d.length > 0);

// Trait de côte
const coast = JSON.parse(fs.readFileSync(path.join(NE_DIR, "coast10.geojson"), "utf8"));
const coastPaths = extractLines(coast)
  .flatMap((l) => clip(l.coords))
  .map((run) => toPath(run, 1.2))
  .filter((d) => d.length > 20);

// Mer/océan : lavis bleu pâle sous des terres découpées couleur papier
// (même principe que les mini-cartes). Polygones de terre Natural Earth,
// intersectés avec la bbox (Sutherland-Hodgman).
function clipPolygon(ring, [bx0, by0, bx1, by1]) {
  const edges = [
    (p) => p[0] >= bx0, (p) => p[0] <= bx1,
    (p) => p[1] >= by0, (p) => p[1] <= by1,
  ];
  const inters = [
    (a, b) => [bx0, a[1] + ((bx0 - a[0]) * (b[1] - a[1])) / (b[0] - a[0])],
    (a, b) => [bx1, a[1] + ((bx1 - a[0]) * (b[1] - a[1])) / (b[0] - a[0])],
    (a, b) => [a[0] + ((by0 - a[1]) * (b[0] - a[0])) / (b[1] - a[1]), by0],
    (a, b) => [a[0] + ((by1 - a[1]) * (b[0] - a[0])) / (b[1] - a[1]), by1],
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
const landGeo = JSON.parse(fs.readFileSync(path.join(NE_DIR, "land10.geojson"), "utf8"));
const landPaths = landGeo.features
  .flatMap((f) => {
    const g = f.geometry;
    if (g.type === "Polygon") return [g.coordinates[0]];
    if (g.type === "MultiPolygon") return g.coordinates.map((p) => p[0]);
    return [];
  })
  .map((r) => clipPolygon(r, BBOX))
  .filter((r) => r.length > 2)
  .map((r) => toPath(r, 1.2) + "Z")
  .filter((d) => d.length > 20);

// Fleuves : Seine et Loire seulement (la maison est sur la Seine, la Loire porte le tour 2021)
const rivers = JSON.parse(fs.readFileSync(path.join(NE_DIR, "rivers10.geojson"), "utf8"));
const riverPaths = extractLines(rivers)
  .filter((l) => ["Seine", "Loire"].includes(l.props.name))
  .flatMap((l) => clip(l.coords))
  .map((run) => toPath(run, 1.2))
  .filter((d) => d.length > 20);

// Traces des Love Tours, séparées par mode (vélo → carmin, à pied → sapin)
const bikePaths = [], hikePaths = [];
for (const f of fs.readdirSync(path.join(ROOT, "public/tours")).filter((f) => f.endsWith(".geojson"))) {
  const slug = f.replace(/\.geojson$/, "");
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/tours", `${slug}.json`), "utf8"));
  const bucket = isBike(meta.mode) ? bikePaths : hikePaths;
  const g = JSON.parse(fs.readFileSync(path.join(ROOT, "public/tours", f), "utf8"));
  for (const l of extractLines(g)) for (const run of clip(l.coords)) bucket.push(toPath(run, 2));
}

const vbW = Math.round(W * SCALE), vbH = Math.round(H * SCALE);

const svg = `<svg class="h-full w-full text-navy" viewBox="0 0 ${vbW} ${vbH}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <rect width="${vbW}" height="${vbH}" fill="#3f7fb5" fill-opacity="0.07" />
  <g fill="var(--color-paper)" stroke="none">
${landPaths.map((d) => `    <path d="${d}" />`).join("\n")}
  </g>
  <g fill="#c9a227" stroke="none" fill-rule="evenodd">
${hypsoPaths.map((b, i) => `    <path d="${b.d}" fill-opacity="${(0.02 + i * 0.015).toFixed(3)}" />`).join("\n")}
  </g>
  <g fill="none" stroke="currentColor" opacity="0.08" stroke-width="1.1">
${coastPaths.map((d) => `    <path d="${d}" />`).join("\n")}
  </g>
  <g fill="none" stroke="#3f7fb5" stroke-opacity="0.3" stroke-width="1" stroke-linecap="round">
${riverPaths.map((d) => `    <path d="${d}" />`).join("\n")}
  </g>
  <g fill="none" stroke="var(--color-carmin)" stroke-width="2.2" stroke-linecap="round" opacity="0.12">
${bikePaths.map((d) => `    <path d="${d}" />`).join("\n")}
  </g>
  <g fill="none" stroke="var(--color-sapin)" stroke-width="2.2" stroke-linecap="round" opacity="0.12">
${hikePaths.map((d) => `    <path d="${d}" />`).join("\n")}
  </g>
</svg>
`;

const out = `---
/**
 * GÉNÉRÉ par scripts/gen-background.mjs — ne pas éditer à la main.
 * Carte réelle en filigrane : côtes et fleuves Natural Earth 10m + traces des
 * Love Tours, projection équirectangulaire centrée sur Sotteville-lès-Rouen.
 */
---

${svg}`;
fs.writeFileSync(path.join(ROOT, "src/components/BackgroundMap.astro"), out);
const kb = (svg.length / 1024).toFixed(0);
console.log(`BackgroundMap.astro : ${coastPaths.length} tronçons de côte, ${riverPaths.length} de fleuve, ${bikePaths.length} traces vélo, ${hikePaths.length} traces à pied, ${kb} Ko`);

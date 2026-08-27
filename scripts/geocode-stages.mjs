#!/usr/bin/env node
/**
 * Ajoute à chaque journée tracée son lieu de départ et d'arrivée
 * (« de Vlissingen à Veere ») dans src/data/tours/<slug>.json.
 *
 * Toponymes : géocodage inverse Nominatim (OpenStreetMap), 1 requête/s,
 * mis en cache dans data/geocode.json (versionné) — les exécutions suivantes
 * ne refont aucune requête. À relancer après `npm run tours:import`.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GEO_DIR = path.join(ROOT, "public/tours");
const DATA_DIR = path.join(ROOT, "src/data/tours");
const CACHE_FILE = path.join(ROOT, "data/geocode.json");
// Corrections manuelles : Nominatim renvoie parfois le hameau voisin plutôt
// que la ville (ex. Zanddijk → Veere). Deux formats de clé acceptés :
//   "lat,lon" (3 décimales, comme le cache) → override de la coordonnée, prioritaire ;
//   "Toponyme"                              → override du nom renvoyé par Nominatim.
// Les overrides jamais utilisés pendant l'exécution sont signalés en fin de
// run : c'est le symptôme d'une réponse Nominatim qui a changé.
const OVERRIDES_FILE = path.join(ROOT, "data/geocode-overrides.json");
const overrides = fs.existsSync(OVERRIDES_FILE) ? JSON.parse(fs.readFileSync(OVERRIDES_FILE, "utf8")) : {};
const overridesUsed = new Set();

const cache = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) : {};
const key = ([lon, lat]) => `${lat.toFixed(3)},${lon.toFixed(3)}`;

async function placeName(coord) {
  const k = key(coord);
  if (cache[k] !== undefined) return cache[k];
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coord[1]}&lon=${coord[0]}&zoom=14`;
  const res = await fetch(url, { headers: { "User-Agent": "love-tours-site (usage personnel)" } });
  const j = await res.json();
  const a = j.address ?? {};
  cache[k] = a.village || a.town || a.city || a.municipality || a.hamlet || a.suburb || null;
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 1));
  await new Promise((r) => setTimeout(r, 1100)); // politique Nominatim : 1 req/s
  return cache[k];
}

const finalName = async (coord) => {
  const k = key(coord);
  if (overrides[k] !== undefined) { overridesUsed.add(k); return overrides[k]; }
  const n = await placeName(coord);
  if (n != null && overrides[n] !== undefined) { overridesUsed.add(n); return overrides[n]; }
  return n;
};

const lineCoords = (f) =>
  f.geometry.type === "MultiLineString" ? f.geometry.coordinates.flat() : f.geometry.coordinates;

for (const file of fs.readdirSync(GEO_DIR).filter((f) => f.endsWith(".geojson"))) {
  const slug = file.replace(".geojson", "");
  const dataFile = path.join(DATA_DIR, `${slug}.json`);
  if (!fs.existsSync(dataFile)) continue;
  const geojson = JSON.parse(fs.readFileSync(GEO_DIR + "/" + file, "utf8"));
  const tour = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  let changed = false;
  for (const day of tour.days) {
    const feat = geojson.features.find((f) => !f.properties.transfer && f.properties.day === day.n);
    if (!feat) continue;
    const coords = lineCoords(feat);
    const from = await finalName(coords[0]);
    const to = await finalName(coords[coords.length - 1]);
    if (from) { day.from = from; changed = true; }
    if (to) { day.to = to; changed = true; }
  }
  if (changed) fs.writeFileSync(dataFile, JSON.stringify(tour, null, 1));
  console.log(`✓ ${slug} : ${tour.days.filter((d) => d.from).length} journées géocodées`);
}

const unused = Object.keys(overrides).filter((k) => !overridesUsed.has(k));
if (unused.length) {
  console.warn(`⚠ overrides sans correspondance (réponse Nominatim changée ? coordonnée déplacée ?) : ${unused.join(", ")}`);
}

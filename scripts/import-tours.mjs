#!/usr/bin/env node
/**
 * Importe les éditions depuis editions/<ANNÉE>_<Nom>/ :
 *  - parse tous les GPX (komoot, Strava…)
 *  - découpe les enregistrements multi-jours par date locale (ex. 1 fichier = 4 jours)
 *  - regroupe les morceaux d'une même journée (montre redémarrée → N segments, 1 jour)
 *  - ignore les doublons (ré-exports avec le même horodatage de départ)
 *  - calcule les stats (distance, D+/D-, temps en mouvement, temps total)
 *  - simplifie la trace (Ramer-Douglas-Peucker, seuil 3 m) pour la carte
 *  - trie les photos par jour via l'horodatage EXIF (JPEG) ou les dossiers jour-N/
 *
 * Sorties :
 *  - src/data/tours/<slug>.json        (méta + stats + vignette)
 *  - public/tours/<slug>.geojson       (1 Feature par jour, pour MapLibre)
 *  - src/assets/tours/<slug>/day-N/    (photos optimisées ensuite par astro:assets)
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODES } from "../src/lib/mode.js";
import { distM, LOOP_MAX_M } from "../src/lib/geo.js";
import { HOME } from "./lib/home.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EDITIONS_DIR = path.join(ROOT, "editions");
const DATA_DIR = path.join(ROOT, "src/data/tours");
const GEO_DIR = path.join(ROOT, "public/tours");
const ASSETS_DIR = path.join(ROOT, "src/assets/tours");

// Dénivelé : seuil anti-bruit selon la source des altitudes.
// komoot fournit des altitudes lissées (modèle de terrain) → 1 m suffit ;
// les enregistrements bruts (baromètre/GPS, ex. Strava) → 3 m.
const ELEV_THRESHOLD_SMOOTH_M = 1;
const ELEV_THRESHOLD_RAW_M = 3;
// Temps en mouvement : vitesse minimale 0,5 m/s (1,8 km/h).
const MOVING_SPEED_MIN_MS = 0.5;
// Simplification de trace : écart perpendiculaire max 3 m.
const RDP_EPSILON_M = 3;
// Fusion des morceaux d'une même journée (montre redémarrée) : on soude deux
// segments consécutifs si le trou fait ≤ 500 m et la pause ≤ 30 min.
const FUSE_MAX_GAP_M = 500;
const FUSE_MAX_PAUSE_S = 1800;

const R_EARTH = 6371008.8; // rayon moyen WGS84, mètres
const M_PER_DEG_LAT = 111132;

const rad = (d) => (d * Math.PI) / 180;

function haversine(lat1, lon1, lat2, lon2) {
  const p1 = rad(lat1), p2 = rad(lat2);
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(a));
}

/** Parse un GPX (regex : suffit pour les exports komoot/Strava). */
function parseGpx(file) {
  const xml = fs.readFileSync(file, "utf8");
  const creator = xml.match(/<gpx[^>]*creator="([^"]*)"/)?.[1] ?? "";
  const nameMatch = xml.match(/<trk>[\s\S]*?<name>([^<]*)<\/name>/);
  const typeMatch = xml.match(/<trk>[\s\S]*?<type>([^<]*)<\/type>/);
  const points = [];
  const re = /<trkpt[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
  let m;
  while ((m = re.exec(xml))) {
    const body = m[3];
    const ele = body.match(/<ele>([^<]+)<\/ele>/);
    const time = body.match(/<time>([^<]+)<\/time>/);
    points.push({
      lat: parseFloat(m[1]),
      lon: parseFloat(m[2]),
      ele: ele ? parseFloat(ele[1]) : null,
      t: time ? Date.parse(time[1]) : null,
    });
  }
  return {
    name: nameMatch?.[1] ?? path.basename(file),
    type: typeMatch?.[1] ?? "",
    elevThreshold: /komoot/i.test(creator) ? ELEV_THRESHOLD_SMOOTH_M : ELEV_THRESHOLD_RAW_M,
    points,
  };
}

/** Date calendaire locale (clé de regroupement par journée). */
const localDate = (t, tzOffsetHours) =>
  new Date(t + tzOffsetHours * 3600 * 1000).toISOString().slice(0, 10);

/** Découpe une suite de points en séries d'une même date locale. */
function splitByLocalDate(points, tzOffsetHours) {
  if (!points.length) return [];
  if (points[0].t == null) return [points]; // trace sans horodatage : indivisible
  const runs = [];
  let current = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1], p = points[i];
    if (p.t != null && prev.t != null &&
        localDate(p.t, tzOffsetHours) !== localDate(prev.t, tzOffsetHours)) {
      runs.push(current);
      current = [];
    }
    current.push(p);
  }
  runs.push(current);
  return runs;
}

function segmentStats(points, elevThreshold) {
  let dist = 0, gain = 0, loss = 0, movingMs = 0;
  let refEle = points[0]?.ele ?? null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const d = haversine(a.lat, a.lon, b.lat, b.lon);
    dist += d;
    if (a.t != null && b.t != null) {
      const dt = b.t - a.t;
      if (dt > 0 && d / (dt / 1000) >= MOVING_SPEED_MIN_MS) movingMs += dt;
    }
    if (b.ele != null) {
      if (refEle == null) refEle = b.ele;
      else if (b.ele - refEle >= elevThreshold) { gain += b.ele - refEle; refEle = b.ele; }
      else if (refEle - b.ele >= elevThreshold) { loss += refEle - b.ele; refEle = b.ele; }
    }
  }
  return { dist, gain, loss, movingMs };
}

/** Stats d'une journée = somme de ses segments (les pauses entre segments ne comptent pas). */
function dayStats(segments, elevThreshold) {
  const per = segments.map((seg) => segmentStats(seg, elevThreshold));
  const first = segments[0][0], last = segments.at(-1).at(-1);
  const start = first.t, end = last.t;
  return {
    distanceKm: Math.round(per.reduce((s, p) => s + p.dist, 0) / 100) / 10,
    gainM: Math.round(per.reduce((s, p) => s + p.gain, 0)),
    lossM: Math.round(per.reduce((s, p) => s + p.loss, 0)),
    movingS: Math.round(per.reduce((s, p) => s + p.movingMs, 0) / 1000),
    elapsedS: start != null && end != null ? Math.round((end - start) / 1000) : 0,
    startTime: start != null ? new Date(start).toISOString() : null,
    endTime: end != null ? new Date(end).toISOString() : null,
  };
}

/** Ramer-Douglas-Peucker itératif, projection équirectangulaire locale. */
function simplify(points, epsM) {
  if (points.length < 3) return points;
  const lat0 = rad(points[Math.floor(points.length / 2)].lat);
  const xy = points.map((p) => [p.lon * M_PER_DEG_LAT * Math.cos(lat0), p.lat * M_PER_DEG_LAT]);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    if (j - i < 2) continue;
    const [x1, y1] = xy[i], [x2, y2] = xy[j];
    const dx = x2 - x1, dy = y2 - y1;
    const norm = Math.hypot(dx, dy);
    let bestD = -1, bestK = i;
    for (let k = i + 1; k < j; k++) {
      const [x0, y0] = xy[k];
      const d = norm === 0
        ? Math.hypot(x0 - x1, y0 - y1)
        : Math.abs(dy * (x0 - x1) - dx * (y0 - y1)) / norm;
      if (d > bestD) { bestD = d; bestK = k; }
    }
    if (bestD > epsM) { keep[bestK] = 1; stack.push([i, bestK], [bestK, j]); }
  }
  return points.filter((_, i) => keep[i]);
}

/** Lit DateTimeOriginal (tag 0x9003) dans l'EXIF d'un JPEG. Renvoie un timestamp ms ou null. */
function exifTimestamp(file, tzOffsetHours) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt16BE(0) !== 0xffd8) return null; // pas un JPEG
  let off = 2;
  while (off + 4 < buf.length) {
    if (buf[off] !== 0xff) return null;
    const marker = buf[off + 1];
    const size = buf.readUInt16BE(off + 2);
    if (marker === 0xe1 && buf.toString("ascii", off + 4, off + 10) === "Exif\0\0") {
      const tiff = off + 10;
      const le = buf.toString("ascii", tiff, tiff + 2) === "II";
      const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
      const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
      const readIfd = (ifdOff, wanted) => {
        const n = u16(tiff + ifdOff);
        const out = {};
        for (let i = 0; i < n; i++) {
          const e = tiff + ifdOff + 2 + i * 12;
          const tag = u16(e);
          if (wanted.includes(tag)) out[tag] = e;
        }
        return out;
      };
      const ifd0 = readIfd(u32(tiff + 4), [0x8769]);
      if (!ifd0[0x8769]) return null;
      const exifIfd = readIfd(u32(ifd0[0x8769] + 8), [0x9003]);
      const entry = exifIfd[0x9003];
      if (!entry) return null;
      const count = u32(entry + 4);
      const valOff = count > 4 ? tiff + u32(entry + 8) : entry + 8;
      const s = buf.toString("ascii", valOff, valOff + count).replace(/\0.*$/, "");
      // Format EXIF : "YYYY:MM:DD HH:MM:SS", en heure locale de la prise de vue.
      const m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
      if (!m) return null;
      return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - tzOffsetHours, +m[5], +m[6]);
    }
    off += 2 + size;
  }
  return null;
}

// Au-delà de cette surface (panoramas), sharp/astro:assets refuse d'optimiser :
// on redimensionne à l'import (côté long ≤ 8000 px, qualité 90).
const MAX_PIXELS = 40e6;
// Conversions HEIC → JPEG mises en cache (le décodage WASM prend ~3 s/photo).
const HEIC_CACHE = path.join(ROOT, "node_modules/.cache/heic-jpg");

async function heicToJpeg(src) {
  const key = `${path.basename(src)}-${fs.statSync(src).size}.jpg`;
  const cached = path.join(HEIC_CACHE, key);
  if (!fs.existsSync(cached)) {
    const convert = (await import("heic-convert")).default;
    const out = await convert({ buffer: fs.readFileSync(src), format: "JPEG", quality: 0.9 });
    fs.mkdirSync(HEIC_CACHE, { recursive: true });
    fs.writeFileSync(cached, Buffer.from(out));
    console.warn(`    HEIC converti : ${path.basename(src)}`);
  }
  return cached;
}

async function copyPhoto(src, destDir, prefix = "") {
  fs.mkdirSync(destDir, { recursive: true });
  let name = prefix + path.basename(src);
  if (/\.heic$/i.test(name)) {
    name = name.replace(/\.heic$/i, ".jpg");
    // Certains exports renomment des JPEG en .HEIC ; les vrais HEIC (HEVC),
    // illisibles par les navigateurs et sharp, sont convertis en JPEG.
    if (!isJpegContent(src)) src = await heicToJpeg(src);
  }
  const dest = path.join(destDir, name);
  const m = await sharp(src).metadata().catch(() => null);
  if (m && m.width * m.height > MAX_PIXELS) {
    await sharp(src).rotate().resize({ width: 8000, height: 8000, fit: "inside" })
      .jpeg({ quality: 90 }).toFile(dest);
    console.warn(`    panorama redimensionné (${m.width}×${m.height}) : ${name}`);
    return;
  }
  fs.copyFileSync(src, dest);
}

const IMG_EXT = /\.(jpe?g|png|webp|avif|heic)$/i;

/** Date depuis le nom de fichier (IMG_20250814_104631, PXL_..., etc.), en heure locale. */
function filenameTimestamp(name, tzOffsetHours) {
  const m = name.match(/(20\d{2})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - tzOffsetHours, +m[5], +m[6]);
}

/** Date EXIF via exiftool (fallback universel, notamment pour les HEIC). */
function exiftoolTimestamp(file, tzOffsetHours) {
  const r = spawnSync("exiftool", ["-s3", "-DateTimeOriginal", file], { encoding: "utf8" });
  if (r.status !== 0) return null;
  const m = r.stdout.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - tzOffsetHours, +m[5], +m[6]);
}

const isJpegContent = (file) => {
  const fd = fs.openSync(file, "r");
  const b = Buffer.alloc(2);
  fs.readSync(fd, b, 0, 2, 0);
  fs.closeSync(fd);
  return b.readUInt16BE(0) === 0xffd8;
};

async function importPhotos(editionDir, slug, days, tzOffsetHours) {
  const photosDir = path.join(editionDir, "photos");
  const destRoot = path.join(ASSETS_DIR, slug);
  fs.rmSync(destRoot, { recursive: true, force: true });
  const counts = new Map();
  if (!fs.existsSync(photosDir)) return counts;

  // Parcours récursif : dossiers jour-N/ pré-triés (l'ordre alphabétique de TES
  // noms de fichiers fait foi), tout le reste = vrac trié chronologiquement.
  const loose = []; // { file, day, t }
  const walk = async (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const dayDir = entry.name.match(/^jour-?(\d+)$/i);
      if (entry.isDirectory() && dayDir) {
        const n = +dayDir[1];
        for (const f of fs.readdirSync(full).filter((f) => IMG_EXT.test(f)).sort()) {
          await copyPhoto(path.join(full, f), path.join(destRoot, `day-${n}`));
          counts.set(n, (counts.get(n) ?? 0) + 1);
        }
      } else if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && IMG_EXT.test(entry.name)) {
        // Rattachement au jour : EXIF, sinon date dans le nom, sinon exiftool (HEIC…).
        const t = (isJpegContent(full) ? exifTimestamp(full, tzOffsetHours) : null)
          ?? filenameTimestamp(entry.name, tzOffsetHours)
          ?? exiftoolTimestamp(full, tzOffsetHours);
        const HALF_DAY = 12 * 3600 * 1000; // marge : photos avant le départ / après l'arrivée
        let day = t == null ? null : days.find((d) => {
          if (!d.stats.startTime) return false;
          const margin = d.noTrace ? 0 : HALF_DAY; // jour photos-seulement : sa date, strictement
          return t >= Date.parse(d.stats.startTime) - margin
            && t <= Date.parse(d.stats.endTime) + margin;
        });
        // Veille de départ (arrivée sur place) : jusqu'à 24 h avant le jour 1 → jour 1.
        const d1 = days[0];
        if (!day && t != null && d1?.stats.startTime
            && t >= Date.parse(d1.stats.startTime) - 24 * 3600 * 1000
            && t < Date.parse(d1.stats.startTime)) {
          day = d1;
        }
        if (day) loose.push({ file: full, day: day.n, t });
        else {
          await copyPhoto(full, path.join(destRoot, "unsorted"));
          counts.set(0, (counts.get(0) ?? 0) + 1);
          console.warn(`    photo sans jour identifiable → unsorted/ : ${entry.name}`);
        }
      }
    }
  };
  await walk(photosDir);

  // Copie du vrac dans l'ordre chronologique : préfixe 001_, 002_… par jour,
  // pour que le tri alphabétique du site restitue l'heure de prise de vue.
  loose.sort((a, b) => (a.t ?? 0) - (b.t ?? 0) || a.file.localeCompare(b.file));
  const seq = new Map();
  for (const ph of loose) {
    const i = (seq.get(ph.day) ?? 0) + 1;
    seq.set(ph.day, i);
    await copyPhoto(ph.file, path.join(destRoot, `day-${ph.day}`),
      `${String(i).padStart(3, "0")}_`);
    counts.set(ph.day, (counts.get(ph.day) ?? 0) + 1);
  }
  return counts;
}

async function importEdition(dirName) {
  const m = dirName.match(/^(\d{4})_(.+)$/);
  if (!m) { console.warn(`ignoré (nom hors convention ANNÉE_Nom) : ${dirName}`); return null; }
  const [, year, rawName] = m;
  const editionDir = path.join(EDITIONS_DIR, dirName);
  const gpxFiles = fs.readdirSync(editionDir).filter((f) => f.endsWith(".gpx")).sort();
  if (!gpxFiles.length) { console.warn(`ignoré (aucun GPX) : ${dirName}`); return null; }

  const metaFile = path.join(editionDir, "edition.json");
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : {};
  const tzOffsetHours = meta.tzOffsetHours ?? 2;
  const slug = `${year}-${rawName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

  const tracks = gpxFiles
    .map((f) => ({ ...parseGpx(path.join(editionDir, f)), file: f }))
    .filter((t) => t.points.length)
    // Tracés planifiés (edition.json → plannedDays) : géométrie fiable, temps fictifs.
    // On efface les horodatages ; les temps seront extrapolés des jours enregistrés.
    .map((t) => {
      const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]+/g, "");
      const def = (meta.plannedDays ?? []).find((d) =>
        norm(t.file).includes(norm(d.match)) || norm(t.name).includes(norm(d.match)));
      if (!def) return t;
      console.warn(`    tracé planifié, temps extrapolés (date ${def.date}) : ${t.file}`);
      return { ...t, planned: def, points: t.points.map((p) => ({ ...p, t: null })) };
    });

  const mode = meta.mode ?? (/bike|bicycle|velo|vélo|cycling/i.test(tracks[0].type) ? "vélo" : "à pied");
  if (!MODES.includes(mode)) {
    throw new Error(`${dirName} : mode "${mode}" inconnu (attendus : ${MODES.join(", ")})`);
  }

  // 1 fichier → N séries (une par date locale), puis tri chronologique global.
  const sortKey = (r) => r.points[0].t
    ?? (r.planned ? Date.parse(r.planned.date + "T12:00:00Z") : 0);
  const runs = tracks
    .flatMap((t) => splitByLocalDate(t.points, tzOffsetHours)
      .map((points) => ({ name: t.name, file: t.file, planned: t.planned, elevThreshold: t.elevThreshold, points })))
    .sort((a, b) => sortKey(a) - sortKey(b))
    // Doublons (ré-exports, copies « (1) ») : même horodatage de départ → on garde le premier.
    .filter((r, i, arr) => {
      if (i > 0 && r.points[0].t != null && r.points[0].t === arr[i - 1].points[0].t) {
        console.warn(`    doublon ignoré (même départ que ${arr[i - 1].file}) : ${r.file}`);
        return false;
      }
      return true;
    });

  // Regroupement par date locale : morceaux d'une même journée → 1 jour, N segments.
  const dayGroups = [];
  for (const run of runs) {
    const key = run.points[0].t != null
      ? localDate(run.points[0].t, tzOffsetHours)
      : run.planned?.date ?? `untimed-${run.file}`;
    const last = dayGroups.at(-1);
    if (last && last.key === key) last.runs.push(run);
    else dayGroups.push({ key, runs: [run] });
  }

  // Soudure des morceaux contigus d'une même journée : le connecteur en ligne
  // droite (≤ 500 m) remplace la portion non enregistrée pendant la pause.
  for (const g of dayGroups) {
    const fused = [g.runs[0]];
    for (const run of g.runs.slice(1)) {
      const prev = fused.at(-1);
      const a = prev.points.at(-1), b = run.points[0];
      const gapM = haversine(a.lat, a.lon, b.lat, b.lon);
      const pauseS = a.t != null && b.t != null ? (b.t - a.t) / 1000 : Infinity;
      if (gapM <= FUSE_MAX_GAP_M && pauseS <= FUSE_MAX_PAUSE_S) {
        console.warn(`    segments soudés (trou ${Math.round(gapM)} m, pause ${Math.round(pauseS / 60)} min) : ${run.file}`);
        prev.points = prev.points.concat(run.points);
      } else {
        fused.push(run);
      }
    }
    g.runs = fused;
  }

  const days = dayGroups.map((g, i) => ({
    n: i + 1,
    name: g.runs[0].name,
    planned: g.runs[0].planned ?? null,
    raw: g.runs.map((r) => r.points),
    elevThreshold: g.runs[0].elevThreshold,
    segments: g.runs.map((r) => simplify(r.points, RDP_EPSILON_M)),
    stats: dayStats(g.runs.map((r) => r.points), g.runs[0].elevThreshold),
  }));

  // Extrapolation des jours planifiés à partir de l'allure des jours enregistrés :
  // vitesse en mouvement, part du temps en mouvement, heure de départ moyenne.
  const recorded = days.filter((d) => !d.planned && d.stats.startTime != null);
  for (const d of days.filter((x) => x.planned)) {
    // Raccordement : la trace planifiée doit partir d'un point connu (ex. le
    // parking où finit un autre jour). Connecteur en ligne droite + stats recalculées.
    const refDay = d.planned.startAtEndOfDay ?? d.planned.startAtStartOfDay;
    const refPt = d.planned.startAt
      ? { lon: d.planned.startAt[0], lat: d.planned.startAt[1] }
      : refDay != null
        ? (d.planned.startAtEndOfDay != null
            ? days.find((x) => x.n === refDay)?.raw.at(-1).at(-1)
            : days.find((x) => x.n === refDay)?.raw[0][0])
        : null;
    if (refPt) {
      const first = d.raw[0][0];
      const gapM = haversine(refPt.lat, refPt.lon, first.lat, first.lon);
      const anchor = { lat: refPt.lat, lon: refPt.lon, ele: first.ele, t: null };
      d.raw[0].unshift(anchor);
      d.segments[0].unshift(anchor);
      d.stats = dayStats(d.raw, d.elevThreshold);
      console.warn(`    jour ${d.n} raccordé au point de référence (connecteur ${Math.round(gapM)} m)`);
    }
    if (!recorded.length) { console.warn(`    aucun jour enregistré : temps du jour ${d.n} non estimés`); continue; }
    const speedKmS = recorded.reduce((s, r) => s + r.stats.distanceKm, 0)
      / recorded.reduce((s, r) => s + r.stats.movingS, 0);
    const movingRatio = recorded.reduce((s, r) => s + r.stats.movingS, 0)
      / recorded.reduce((s, r) => s + r.stats.elapsedS, 0);
    const startHourLocal = recorded.reduce((s, r) =>
      s + (Date.parse(r.stats.startTime) / 3600000 + tzOffsetHours) % 24, 0) / recorded.length;
    const movingS = Math.round(d.stats.distanceKm / speedKmS);
    const elapsedS = Math.round(movingS / movingRatio);
    const startMs = Date.parse(d.planned.date + "T00:00:00Z") + (startHourLocal - tzOffsetHours) * 3600000;
    d.stats = {
      ...d.stats,
      movingS,
      elapsedS,
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(startMs + elapsedS * 1000).toISOString(),
    };
    d.estimated = true;
    console.warn(`    jour ${d.n} estimé : ${d.stats.distanceKm} km → ${Math.round(movingS / 36) / 100} h en mouvement`);
  }

  // Jours épilogue/prologue (edition.json → extraDays) : pas de trace GPS,
  // photos seulement — ex. journée de retour en bus. Rattachement par date locale.
  for (const x of meta.extraDays ?? []) {
    const startMs = Date.parse(x.date + "T00:00:00Z") - tzOffsetHours * 3600 * 1000;
    days.push({
      n: days.length + 1,
      name: x.name ?? "",
      noTrace: true,
      raw: [],
      segments: [],
      stats: {
        distanceKm: 0, gainM: 0, lossM: 0, movingS: 0, elapsedS: 0,
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(startMs + 86399000).toISOString(),
      },
    });
  }

  // Ordre d'affichage : chronologique (un prologue passe avant le jour 1).
  // Étiquette : J1..JN pour les jours tracés, ✦ pour les jours photos-seulement.
  days.sort((a, b) => Date.parse(a.stats.startTime ?? 0) - Date.parse(b.stats.startTime ?? 0));
  let traceIdx = 0;
  days.forEach((d, i) => {
    d.n = i + 1;
    d.label = d.noTrace ? "✦" : `J${++traceIdx}`;
  });

  // Valeurs officielles (edition.json → statsOverrides) : prioritaires sur le
  // calcul (ex. D+ komoot calculé sur des altitudes non exportées). Appliquées
  // APRÈS le tri : les clés d'edition.json (statsOverrides, dayTitles,
  // transfers) désignent toutes le même n° de jour, celui affiché sur le site.
  for (const d of days) {
    const o = (meta.statsOverrides ?? {})[String(d.n)];
    if (o) d.stats = { ...d.stats, ...o };
  }

  const all = days.flatMap((d) => d.segments.flat());
  const bbox = [
    Math.min(...all.map((p) => p.lon)), Math.min(...all.map((p) => p.lat)),
    Math.max(...all.map((p) => p.lon)), Math.max(...all.map((p) => p.lat)),
  ].map((v) => +v.toFixed(5));

  const photoCounts = await importPhotos(editionDir, slug, days, tzOffsetHours);

  const geojson = {
    type: "FeatureCollection",
    features: days.filter((d) => d.segments.length).map((d) => {
      const coords = d.segments.map((seg) => seg.map((p) => [+p.lon.toFixed(5), +p.lat.toFixed(5)]));
      return {
        type: "Feature",
        properties: { day: d.n, name: d.name },
        geometry: coords.length === 1
          ? { type: "LineString", coordinates: coords[0] }
          : { type: "MultiLineString", coordinates: coords },
      };
    }),
  };

  // Transferts entre étapes (edition.json "transfers" : bus, ferry…) : tracé
  // routier réel via OSRM, mis en cache dans data/transfers/ (versionné) pour
  // ne pas dépendre du réseau aux imports suivants.
  for (const t of meta.transfers ?? []) {
    // Extrémités : point explicite [lon,lat] ou "home" (t.from / t.to), sinon
    // fin du jour t.fromDay / début du jour t.toDay.
    const resolvePoint = (p) => (p === "home" ? HOME : p);
    const dayPoint = (n, last) => {
      const d = days.find((x) => x.n === n);
      if (!d?.segments.length) return null;
      const pt = last ? d.segments.at(-1).at(-1) : d.segments[0][0];
      return [pt.lon, pt.lat];
    };
    const a = resolvePoint(t.from) ?? (t.fromDay != null ? dayPoint(t.fromDay, true) : null);
    const b = resolvePoint(t.to) ?? (t.toDay != null ? dayPoint(t.toDay, false) : null);
    if (!a || !b) {
      throw new Error(`${slug} : transfert ${t.fromDay ?? "?"}→${t.toDay ?? "?"} sans extrémité résoluble`);
    }
    let geometry;
    if (t.direct) {
      // Liaison directe (ferry…) : segment sur l'eau, pas de routage routier.
      geometry = { type: "LineString", coordinates: [a, b].map((c) => c.map((v) => +v.toFixed(5))) };
    } else {
      const cacheDir = path.join(ROOT, "data/transfers");
      fs.mkdirSync(cacheDir, { recursive: true });
      // Clé de cache = coordonnées des extrémités : corriger un point dans
      // edition.json invalide le cache ; renuméroter les jours ne l'invalide pas.
      const ckey = (c) => `${c[0].toFixed(4)},${c[1].toFixed(4)}`;
      const cacheFile = path.join(cacheDir, `${slug}_${ckey(a)}_${ckey(b)}.json`);
      // Anciens caches nommés <slug>-<fromDay>-<toDay>.json (réponse OSRM
      // complète) : migrés en place, seule la géométrie est conservée.
      const legacy = path.join(cacheDir, `${slug}-${t.fromDay ?? "pt"}-${t.toDay ?? "pt"}.json`);
      if (!fs.existsSync(cacheFile) && fs.existsSync(legacy)) {
        const old = JSON.parse(fs.readFileSync(legacy, "utf8"));
        fs.writeFileSync(cacheFile, JSON.stringify({ geometry: old.routes?.[0]?.geometry ?? old.geometry }));
        fs.rmSync(legacy);
        console.warn(`    cache transfert migré : ${path.basename(legacy)} → ${path.basename(cacheFile)}`);
      }
      if (!fs.existsSync(cacheFile)) {
        const url = `https://router.project-osrm.org/route/v1/driving/${a[0]},${a[1]};${b[0]},${b[1]}?geometries=geojson&overview=full`;
        let res;
        try {
          res = await fetch(url).then((r) => r.json());
        } catch (err) {
          throw new Error(`${slug} : transfert ${t.fromDay ?? "?"}→${t.toDay ?? "?"} : OSRM injoignable (${err.message})`);
        }
        if (res.code !== "Ok") {
          throw new Error(`${slug} : transfert ${t.fromDay ?? "?"}→${t.toDay ?? "?"} : OSRM ${res.code}`);
        }
        fs.writeFileSync(cacheFile, JSON.stringify({ geometry: res.routes[0].geometry }));
      }
      geometry = JSON.parse(fs.readFileSync(cacheFile, "utf8")).geometry;
    }
    geojson.features.push({
      type: "Feature",
      properties: { transfer: t.mode ?? "bus", fromDay: t.fromDay ?? null, toDay: t.toDay ?? null },
      geometry,
    });
  }

  // Deux transferts sur le même tronçon (ex. ferry aller/retour 2026) : le
  // doublon est marqué `dup` — la carte ne dessine la ligne et le label
  // qu'une fois (sinon : opacités cumulées et deux labels superposés).
  {
    const transfers = geojson.features.filter((f) => f.properties.transfer);
    const ends = (f) => [f.geometry.coordinates[0], f.geometry.coordinates.at(-1)];
    const near = (p, q) => distM(p, q) < 150;
    const kept = [];
    for (const f of transfers) {
      const [a1, b1] = ends(f);
      const dupOf = kept.find((g) => {
        const [a2, b2] = ends(g);
        return (near(a1, a2) && near(b1, b2)) || (near(a1, b2) && near(b1, a2));
      });
      if (dupOf) f.properties.dup = true;
      else kept.push(f);
    }
  }

  const totals = {
    distanceKm: +days.reduce((s, d) => s + d.stats.distanceKm, 0).toFixed(1),
    gainM: days.reduce((s, d) => s + d.stats.gainM, 0),
    movingS: days.reduce((s, d) => s + d.stats.movingS, 0),
    days: days.filter((d) => !d.noTrace).length,
  };

  const tour = {
    slug,
    year: +year,
    title: meta.title ?? rawName.replace(/-/g, " "),
    mode,
    flag: meta.flag ?? "",
    country: meta.country ?? "",
    description: meta.description ?? "",
    startDate: days[0].stats.startTime?.slice(0, 10) ?? null,
    endDate: days.at(-1).stats.endTime?.slice(0, 10) ?? null,
    bbox,
    cover: meta.cover ?? "",
    totals: { ...totals, photos: [...photoCounts.entries()].filter(([k]) => k > 0).reduce((s, [, v]) => s + v, 0) },
    // Modes de transfert présents (bus, ferry…) : pilote la légende des
    // pointillés sur la page détail, sans relire le geojson au build.
    transferModes: [...new Set(geojson.features.map((f) => f.properties.transfer).filter(Boolean))],
    days: days.map((d) => {
      const first = d.segments[0]?.[0];
      const last = d.segments.at(-1)?.at(-1);
      return {
        n: d.n, name: d.name,
        date: d.stats.startTime != null
          ? localDate(Date.parse(d.stats.startTime), tzOffsetHours)
          : null,
        // Titre manuel éventuel (edition.json "dayTitles") : prime sur le trajet géocodé.
        title: (meta.dayTitles ?? {})[String(d.n)] ?? undefined,
        // Boucle géométrique (départ ≈ arrivée) : même définition que la carte.
        loop: first != null && distM([first.lon, first.lat], [last.lon, last.lat]) < LOOP_MAX_M,
        photoCount: photoCounts.get(d.n) ?? 0,
        estimated: d.estimated ?? false,
        noTrace: d.noTrace ?? false,
        label: d.label,
        ...d.stats,
      };
    }),
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(GEO_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, `${slug}.json`), JSON.stringify(tour, null, 1));
  fs.writeFileSync(path.join(GEO_DIR, `${slug}.geojson`), JSON.stringify(geojson));

  // Sauvegarde versionnée des métadonnées manuelles : editions/ est hors dépôt
  // (photos, GPX), mais les edition.json sont la seule source des transferts,
  // dayTitles, statsOverrides… → copie dans data/editions/ (committée).
  if (fs.existsSync(metaFile)) {
    const backupDir = path.join(ROOT, "data/editions");
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(metaFile, path.join(backupDir, `${slug}.json`));
  }

  const nPhotos = [...photoCounts.values()].reduce((a, b) => a + b, 0);
  const multi = days.filter((d) => d.segments.length > 1).length;
  console.log(`✓ ${slug} : ${days.length} jours${multi ? ` (${multi} multi-segments)` : ""}, ${totals.distanceKm} km, ${all.length} pts (simplifiés), ${nPhotos} photos`);
  return slug;
}

// Importe tout, puis purge les sorties orphelines — uniquement sur demande
// explicite (--prune) : sur un clone sans editions/, une purge implicite
// effacerait toutes les données versionnées.
fs.mkdirSync(EDITIONS_DIR, { recursive: true });
const slugs = [];
for (const e of fs.readdirSync(EDITIONS_DIR, { withFileTypes: true })) {
  if (!e.isDirectory()) continue;
  const slug = await importEdition(e.name);
  if (slug) slugs.push(slug);
}
if (!slugs.length) {
  console.error("Aucune édition importée : editions/ est absent ou vide. Rien n'est supprimé.");
  process.exit(1);
}
const prune = process.argv.includes("--prune");
for (const dir of [DATA_DIR, GEO_DIR, path.join(ROOT, "src/data/minimaps")]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    const s = f.replace(/\.(json|geojson)$/, "");
    if (slugs.includes(s)) continue;
    if (prune) {
      fs.rmSync(path.join(dir, f));
      console.warn(`  supprimé (édition disparue) : ${path.relative(ROOT, path.join(dir, f))}`);
    } else {
      console.warn(`  ⚠ orphelin (édition absente de editions/) : ${path.relative(ROOT, path.join(dir, f))} — relancer avec --prune pour supprimer`);
    }
  }
}
console.log(`${slugs.length} édition(s) importée(s).`);

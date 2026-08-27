/** Charge tous les tours importés (src/data/tours/*.json), triés du plus récent au plus ancien. */
const modules = import.meta.glob("../data/tours/*.json", { eager: true });

export const tours = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => b.year - a.year || b.startDate?.localeCompare(a.startDate ?? "") || 0);

export function formatHours(seconds) {
  let h = Math.floor(seconds / 3600);
  let m = Math.round((seconds % 3600) / 60);
  // L'arrondi des minutes peut donner 60 (ex. 3599 s) : reporter sur l'heure.
  if (m === 60) { h += 1; m = 0; }
  return `${h}h${String(m).padStart(2, "0")}`;
}

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", timeZone: "UTC" });
const DATE_FMT_Y = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });

export function formatRange(start, end) {
  if (!start || !end) return "";
  const s = new Date(start);
  const e = new Date(end);
  // Même mois et même année : on ne répète pas le mois (« du 22 au 28 juillet 2024 »)
  if (s.getUTCFullYear() === e.getUTCFullYear() && s.getUTCMonth() === e.getUTCMonth()) {
    return `du ${String(s.getUTCDate()).padStart(2, "0")} au ${DATE_FMT_Y.format(e)}`;
  }
  return `du ${DATE_FMT.format(s)} au ${DATE_FMT_Y.format(e)}`;
}

export function formatDay(date) {
  if (!date) return "";
  const s = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(new Date(date));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Extrait le nom d'étape d'un nom de trace GPX :
 * retire préfixes [TAG], répétition du titre, « Jour N » et séparateurs, émojis.
 * Renvoie "" si rien d'informatif ne reste.
 */
export function stageName(rawName, tourTitle = "") {
  let s = rawName ?? "";
  s = s.replace(/\[[^\]]*\]/g, " ");
  if (tourTitle) s = s.split(tourTitle).join(" ");
  s = s.replace(/(?:jour|[ée]tape)\s*\d+/gi, " ");
  s = s.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u200d\ufe0f]/gu, " ");
  s = s.replace(/[_:–—-]+/g, " ").replace(/\s+/g, " ").trim();
  return /\p{L}{2,}/u.test(s) ? s : "";
}

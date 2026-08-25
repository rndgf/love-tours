/** Charge tous les tours importés (src/data/tours/*.json), triés du plus récent au plus ancien. */
const modules = import.meta.glob("../data/tours/*.json", { eager: true });

export const tours = Object.values(modules)
  .map((m) => m.default)
  .sort((a, b) => b.year - a.year || b.startDate?.localeCompare(a.startDate ?? "") || 0);

export const modeIcon = (mode) => (mode === "vélo" ? "🚴" : "🥾");

export function formatHours(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h} h ${String(m).padStart(2, "0")}`;
}

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
const DATE_FMT_Y = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function formatRange(start, end) {
  if (!start || !end) return "";
  return `du ${DATE_FMT.format(new Date(start))} au ${DATE_FMT_Y.format(new Date(end))}`;
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

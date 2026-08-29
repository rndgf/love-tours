/**
 * Interactions de la page détail d'une édition :
 * - sélection d'un jour (puces + carte) → cartouche de stats teinté à la
 *   couleur du jour, hash #jN, remontée douce si le cartouche est hors écran
 *   (compteurs joués à l'arrivée) ;
 * - ESC → retour à la vue complète (sauf lightbox ouverte : son ESC natif) ;
 * - bouton flottant « retour en haut » après 600 px de scroll.
 * Détail des comportements : docs/AGENT-SITE.md §4.3.
 */
import { formatHours } from "../lib/tours.js";
import { parseDayHash, dayHash } from "../lib/dayhash.js";
import { countUp } from "./stat-counters";
import { scrollToEl, scrollToTop } from "./smooth-scroll";

type DayStats = {
  n: number;
  distanceKm: number;
  gainM: number;
  movingS: number;
  elapsedS: number;
  color: string;
};
type Totals = { distanceKm: number; days: number; gainM: number; movingS: number };
type StatRow = [string | number, string];

export function initTourPage(): void {
  const data = document.getElementById("day-stats-data");
  if (!data) return;
  const { days, totals } = JSON.parse(data.textContent!) as {
    days: DayStats[];
    totals: Totals;
  };

  const cells = [...document.querySelectorAll("#edition-stats > div")];
  const setStats = (rows: StatRow[], color?: string, animate = true) =>
    rows.forEach(([value, label], i) => {
      const dd = cells[i].querySelector("dd")!;
      dd.textContent = String(value);
      dd.style.color = color ?? "";
      cells[i].querySelector("dt")!.textContent = label;
      if (animate) countUp(dd);
    });
  const animateStats = () => cells.forEach((c) => countUp(c.querySelector("dd")!));

  const dayRows = (d: DayStats): StatRow[] => [
    [d.distanceKm, "km"],
    [d.gainM, "m dénivelé +"],
    [formatHours(d.movingS), "effort"],
    [formatHours(d.elapsedS), "au total"],
  ];
  const totalRows = (t: Totals): StatRow[] => [
    [t.distanceKm, "km"],
    [t.days, "jours"],
    [t.gainM, "m dénivelé +"],
    [formatHours(t.movingS), "effort"],
  ];

  const buttons = [...document.querySelectorAll<HTMLElement>("[data-zoom-day]")];
  const selectDay = (n: number, scroll = true) => {
    buttons.forEach((b) => {
      const active = +b.dataset.zoomDay! === n;
      b.classList.toggle("border-navy", active);
      b.classList.toggle("bg-paper-deep", active);
    });
    const d = days.find((x) => x.n === n);
    // Cartouche hors écran (clic depuis la carte, plus bas) : remonter en
    // douceur d'abord, et ne jouer les compteurs qu'à l'arrivée pour qu'ils
    // soient visibles.
    const stats = document.getElementById("edition-stats")!;
    const r = stats.getBoundingClientRect();
    const needScroll = scroll && (r.top < 0 || r.bottom > innerHeight);
    setStats(d ? dayRows(d) : totalRows(totals), d?.color, !needScroll);
    history.replaceState(null, "", n > 0 ? dayHash(n) : location.pathname + location.search);
    if (needScroll) scrollToEl(stats, animateStats);
  };

  buttons.forEach((btn) => btn.addEventListener("click", () => selectDay(+btn.dataset.zoomDay!)));

  // Deep-link #jN : jour présélectionné (sans remontée).
  const initial = parseDayHash(location.hash);
  if (initial != null && days.some((d) => d.n === initial)) selectDay(initial, false);

  // ESC : retour à la vue complète — sauf si une lightbox est ouverte
  // (son ESC natif la ferme, sans plus).
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.querySelector("dialog[open]")) return;
    document.querySelector<HTMLElement>('[data-zoom-day="0"]')?.click();
  });

  // Bouton flottant « retour en haut ».
  const backTop = document.getElementById("back-to-top");
  if (backTop) {
    backTop.addEventListener("click", scrollToTop);
    const toggle = () => {
      backTop.style.display = window.scrollY < 600 ? "none" : "flex";
    };
    window.addEventListener("scroll", toggle, { passive: true });
    toggle();
  }
}

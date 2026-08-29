/**
 * Compteurs des cartouches de stats : chaque nombre défile de 0 jusqu'à sa
 * valeur (1,2 s, décélération cubique). Le texte final est rendu côté
 * serveur — sans JavaScript ou avec prefers-reduced-motion, les valeurs
 * sont déjà correctes et rien ne bouge.
 *
 * Import direct par les pages (remplace l'ancien `window.statCountUp` et le
 * hack d'ordre d'exécution qui allait avec).
 */
import { prefersReducedMotion } from "./smooth-scroll";

const DURATION_MS = 1200;

/** Registre des animations en cours : une seule par élément (la nouvelle
 *  annule la précédente, sinon deux boucles rAF se disputent le texte). */
const running = new WeakMap<HTMLElement, number>();

/** Lance le défilement 0 → valeur sur un élément dont le texte EST la valeur
 *  finale. Les caractères non numériques (« h » de l'effort, « . ») restent
 *  fixes ; un segment à zéro initial (« 05 ») garde sa largeur. */
export function countUp(el: HTMLElement): void {
  if (prefersReducedMotion()) return; // le texte final est déjà en place
  const final = el.textContent ?? "";
  const parts = final.match(/\d+|\D+/g) ?? [];
  let start = 0;
  cancelAnimationFrame(running.get(el) ?? 0);
  const step = (t: number) => {
    if (!start) start = t;
    const p = Math.min((t - start) / DURATION_MS, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = parts
      .map((seg) => {
        if (!/^\d/.test(seg)) return seg;
        const shown = String(Math.round(parseInt(seg, 10) * eased));
        return seg.startsWith("0") ? shown.padStart(seg.length, "0") : shown;
      })
      .join("");
    if (p < 1) running.set(el, requestAnimationFrame(step));
    else el.textContent = final;
  };
  running.set(el, requestAnimationFrame(step));
}

/** Anime chaque `.stat-count` de la page à son premier passage à l'écran. */
export function initStatCounters(): void {
  const counters = document.querySelectorAll<HTMLElement>(".stat-count");
  if (!counters.length || prefersReducedMotion()) return;
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          io.unobserve(e.target);
          countUp(e.target as HTMLElement);
        }
      }
    },
    { threshold: 0.4 },
  );
  counters.forEach((el) => io.observe(el));
}

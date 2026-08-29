/**
 * Défilement lissé du site (Lenis) — module singleton partagé par tous les
 * scripts clients (remplace l'ancien `window.lenis`).
 *
 * Contraintes (voir docs/AGENT-SITE.md §5.1) :
 * - Lenis actif seulement ≥ 640 px et hors prefers-reduced-motion (mobile :
 *   scroll natif déjà inertiel ; les ancres y sont lissées par la règle CSS
 *   `scroll-behavior: smooth` sous 640 px).
 * - `html { scroll-behavior: smooth }` global est interdit avec Lenis.
 * - Tout défilement programmatique passe par ces helpers : un scrollIntoView
 *   natif se ferait rattraper par la position interne de Lenis.
 */
import Lenis from "lenis";

let lenis: Lenis | null = null;

export const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** À appeler une fois par page (layout). anchors: true reprend les #ancres. */
export function initSmoothScroll(): void {
  if (prefersReducedMotion()) return;
  if (!window.matchMedia("(min-width: 640px)").matches) return;
  lenis = new Lenis({ autoRaf: true, anchors: true });
}

/** Remontée douce en haut de page (repli natif sans Lenis). */
export function scrollToTop(): void {
  if (lenis) lenis.scrollTo(0);
  else window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Défilement doux vers un élément, en respectant son scroll-margin-top CSS.
 * `onArrive` est garanti une seule fois : onComplete Lenis peut ne pas se
 * déclencher (cible quasi atteinte, molette pendant le trajet) → filet
 * setTimeout ; sans Lenis, appel immédiat après le scrollIntoView natif.
 */
export function scrollToEl(el: HTMLElement, onArrive?: () => void): void {
  if (lenis) {
    const offset = -(parseFloat(getComputedStyle(el).scrollMarginTop) || 0);
    let done = false;
    const arrive = () => {
      if (done) return;
      done = true;
      onArrive?.();
    };
    lenis.scrollTo(el, { offset, duration: 0.9, onComplete: arrive });
    if (onArrive) setTimeout(arrive, 1000);
  } else {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    onArrive?.();
  }
}

/**
 * Verrou du défilement de la page (lightbox ouverte) : sans lui, un
 * glissement sur la photo fait aussi défiler le site en arrière-plan.
 */
export function lockScroll(): void {
  document.documentElement.style.overflow = "hidden";
  lenis?.stop();
}

export function unlockScroll(): void {
  document.documentElement.style.overflow = "";
  lenis?.start();
}

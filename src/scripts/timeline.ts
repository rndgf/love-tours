/**
 * Voyageurs de la timeline (homepage) — desktop : pastille aimantée de point
 * d'année en point d'année le long du fil vertical ; mobile : progression
 * continue sur la bordure basse de la nav des années (+ année active).
 * Détail des comportements : docs/AGENT-SITE.md §5.3.
 */
import { prefersReducedMotion } from "./smooth-scroll";

/** Ressort amorti : accélération au départ, décélération à l'arrivée,
 *  dépassement ~5 px sur un saut de 500 px, posé en ~1,4 s (constantes
 *  choisies par simulation — voir AGENT-SITE.md). */
const SPRING_STIFFNESS = 0.012;
const SPRING_DAMPING = 0.84;
/** Le fil s'arrête à 1,5 rem des bords du <ol> (top-6/bottom-6). */
const RAIL_PAD = 24;
/** Le voyageur mobile ne colle pas aux bords de la nav. */
const NAV_PAD = 20;
/** Tolérance verticale de la détection « carte en regard ». */
const ZONE_PAD = 16;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

type Spring = { to(v: number): void; settle(): void };

function makeSpring(apply: (v: number) => void): Spring {
  let target = 0;
  let cur = 0;
  let vel = 0;
  let raf = 0;
  const step = () => {
    vel += (target - cur) * SPRING_STIFFNESS;
    vel *= SPRING_DAMPING;
    cur += vel;
    if (Math.abs(target - cur) < 0.3 && Math.abs(vel) < 0.3) {
      cur = target;
      vel = 0;
      raf = 0;
    } else {
      raf = requestAnimationFrame(step);
    }
    apply(cur);
  };
  return {
    to(v: number) {
      target = v;
      if (prefersReducedMotion()) {
        cur = v;
        vel = 0;
        apply(v);
      } else if (!raf) {
        raf = requestAnimationFrame(step);
      }
    },
    settle() {
      cur = target;
      vel = 0;
      apply(cur);
    },
  };
}

/** Bascule cycliste/randonneur d'une pastille selon le mode. */
function setRiderIcon(root: HTMLElement, mode?: string): void {
  root.querySelector(".rider-bike")?.classList.toggle("hidden", mode !== "vélo");
  root.querySelector(".rider-hike")?.classList.toggle("hidden", mode === "vélo");
}

export function initTimeline(): void {
  const ol = document.getElementById("timeline");
  if (!ol) return;
  const items = [...ol.querySelectorAll<HTMLElement>(".timeline-item")];
  if (!items.length) return;

  const rider = document.getElementById("tl-rider");
  const riderSpring = rider ? makeSpring((v) => (rider.style.top = `${v}px`)) : null;

  const nav = document.getElementById("year-nav");
  const navRider = document.getElementById("yn-rider");
  const links = nav ? [...nav.querySelectorAll<HTMLElement>(".yn-link")] : [];
  const navSpring = navRider ? makeSpring((v) => (navRider.style.left = `${v}px`)) : null;
  let lastActive: HTMLElement | null = null;

  const update = () => {
    const rect = ol.getBoundingClientRect();
    const center = window.innerHeight / 2;
    // Carte dont la zone verticale contient le centre du viewport. Aucune
    // (avant le fil, ou tout en bas) : voyageurs masqués — pas de picto par
    // défaut qui recouvrirait la flèche du fil.
    const cur = items.find((li) => {
      const r = li.getBoundingClientRect();
      return center >= r.top - ZONE_PAD && center < r.bottom + ZONE_PAD;
    });

    // — Desktop : fil vertical —
    if (rider && riderSpring) {
      // L'année en regard prend l'effet hover (accent + zoom, cf. global.css).
      items.forEach((li) => li.classList.toggle("is-current", li === cur));
      // Cible : aimantée sur le point d'année de la carte en regard ; en
      // approche (entre le haut du fil et la première carte), le voyageur
      // parcourt le fil au rythme du scroll avant de s'aimanter.
      let targetY: number | null = null;
      let mode: string | undefined;
      if (cur) {
        const r = cur.getBoundingClientRect();
        targetY = r.top + r.height / 2 - rect.top;
        mode = cur.dataset.mode;
      } else {
        const first = items[0].getBoundingClientRect();
        if (center >= rect.top && center < first.top) {
          targetY = center - rect.top;
          mode = items[0].dataset.mode;
        }
      }
      rider.style.visibility = targetY != null ? "visible" : "hidden";
      if (targetY != null) {
        riderSpring.to(clamp(targetY, RAIL_PAD, rect.height - RAIL_PAD));
        setRiderIcon(rider, mode);
      }
    }

    // — Mobile : nav des années —
    if (nav && navRider && navSpring && nav.offsetWidth) {
      links.forEach((l) =>
        l.classList.toggle("is-active", !!cur && l.dataset.year === cur.id.slice(1)),
      );
      // Rangée défilante : recentre l'année active quand elle change.
      const active = cur ? links.find((l) => l.dataset.year === cur.id.slice(1)) : null;
      if (active && active !== lastActive) {
        lastActive = active;
        const sc = active.parentElement!;
        sc.scrollTo({
          left: active.offsetLeft - (sc.clientWidth - active.offsetWidth) / 2,
          behavior: "smooth",
        });
      }
      navRider.style.visibility = cur ? "visible" : "hidden";
      if (cur) {
        const p = clamp((center - rect.top) / rect.height, 0, 1);
        navSpring.to(NAV_PAD + p * (nav.offsetWidth - 2 * NAV_PAD));
        setRiderIcon(navRider, cur.dataset.mode);
      }
    }
  };

  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);
  // Position de départ sans traîne (chargement en milieu de page, #y…).
  update();
  riderSpring?.settle();
  navSpring?.settle();
}

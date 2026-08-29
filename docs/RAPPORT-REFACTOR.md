# Rapport de refactorisation — audit du 29/08/2026

> Objectif fixé : éliminer le code « empilé » au fil des demandes, rendre le
> front modulaire et pérenne (bonnes pratiques Astro/TypeScript), sans perdre
> **aucune** fonctionnalité ni **aucun** élément de design, en préservant la
> non-indexation. Ce rapport liste chaque changement et sa justification,
> avec les preuves de non-régression.

## 1. Constats de l'audit

| # | Constat | Où |
|---|---|---|
| C1 | Couplage par variables globales `window.lenis` / `window.statCountUp` entre le layout et les pages, avec casts `(window as any)` et un **hack d'ordre d'exécution** (`setTimeout(0)` pour le deep-link `#jN`, le script de page s'exécutant avant celui du layout) | `Base.astro`, `[slug].astro`, `Lightbox.astro` |
| C2 | Bloc « cellule de stat » (picto + valeur + label + filets) dupliqué **3 fois** avec des branches mortes (`extra === "dot"`, `extra === "clock"` : plus aucun picto ne les utilise) et des attributs SVG sans effet (`stroke-navy`, `stroke-width`, `stroke-linecap/linejoin`, `stroke="none"` sur des aplats `fill`) | `index.astro`, `[slug].astro` ×2 |
| C3 | Cartouche `<dl>` de relevés dupliqué **2 fois** (HP 5 colonnes / détail 4 colonnes) avec deux formules de filets divergentes, dont des classes de filet inutiles sur la cellule cachée en mobile | `index.astro`, `[slug].astro` |
| C4 | Markup du « voyageur » (pastille + 2 pictos) dupliqué **2 fois** | `index.astro` |
| C5 | Data-URI de l'onde du footer dupliquée **2 fois** (600 caractères ×2), encodée à la main | `Base.astro` |
| C6 | ~150 lignes de script inline par page, non factorisées, fonction de ressort nommée `mkLerp` (c'est un ressort amorti, plus un lerp), constantes magiques dispersées | `index.astro`, `[slug].astro`, `Base.astro` |
| C7 | Verrou de scroll de la lightbox dupliquant la connaissance de Lenis (`stop/start` + `overflow`) | `Lightbox.astro` |

Animations : déjà conformes (boucles rAF auto-arrêtées, cœur battant à
plage morte ~78 %, `will-change` ciblé, `prefers-reduced-motion` partout,
Lenis désactivé en mobile) — aucun changement nécessaire, hors rangement.

## 2. Changements appliqués

### Nouveaux modules clients (`src/scripts/`, TypeScript)

| Module | Contenu | Remplace |
|---|---|---|
| `smooth-scroll.ts` | singleton Lenis + `scrollToTop`, `scrollToEl` (offset scroll-margin + garantie `onArrive` unique), `lockScroll`/`unlockScroll`, `prefersReducedMotion` | `window.lenis`, 3 copies du repli natif, verrou lightbox |
| `stat-counters.ts` | `countUp` (typé, registre `WeakMap` au lieu de la propriété expando `__cuRaf`) + `initStatCounters` (IntersectionObserver) | `window.statCountUp` et son exposition conditionnelle |
| `timeline.ts` | voyageurs HP : ressort `makeSpring` (renommé, constantes documentées `SPRING_STIFFNESS`/`SPRING_DAMPING`/`RAIL_PAD`/`NAV_PAD`/`ZONE_PAD`), détection carte en regard, aimantation, approche, année active | script inline de 130 lignes d'`index.astro` |
| `tour-page.ts` | sélection de jour (types `DayStats`/`Totals`, `dayRows`/`totalRows` nommés), ESC, bouton retour en haut | 2 scripts inline de `[slug].astro` |

**Justification C1** : les scripts Astro étant des modules Vite, l'import
direct donne l'instance partagée sans ordre d'exécution à gérer — le
`setTimeout(0)` du deep-link et tous les `(window as any)` sont supprimés
(vérifié : zéro occurrence dans `src/`). Le deep-link `#jN` s'applique
désormais synchroniquement.

### Nouveaux composants (`src/components/`)

| Composant | Remplace | Justification |
|---|---|---|
| `StatCells.astro` | 3 copies (C2) | une seule anatomie de cellule ; suppression des branches mortes `dot`/`clock` et des attributs stroke sans effet (les tracés Font Awesome sont des aplats, `stroke` par défaut = `none`) |
| `StatsPanel.astro` | 2 copies (C3) | formule de filets **unifiée** sur l'index mobile des cellules visibles (reproduit exactement les deux anciens rendus, preuve §3) ; la cellule `hideMobile` ne porte plus de classes de filet inertes |
| `TimelineRider.astro` | 2 copies (C4) | pictos issus de `moveIcon()` en un seul endroit |

### Layout et pages

- `Base.astro` : onde du footer définie une fois (`FOOTER_WAVE`, SVG lisible
  encodé par `encodeURIComponent`, `url("…")` guillemété — les apostrophes
  brutes sont interdites dans un `url()` nu) et posée par un `map` sur les
  deux côtés (C5). Script réduit à l'orchestration (init Lenis + compteurs +
  clic médaillon).
- `index.astro` : frontmatter déclaratif (`globalStats`, `cardStats()`,
  `TILTS`, `CORNERS` nommés), script réduit à `initTimeline()`.
- `[slug].astro` : `editionStats`/`dayStats()` déclarés dans le frontmatter,
  script réduit à `initTourPage()`.
- `Lightbox.astro` : verrou de scroll délégué à `lockScroll`/`unlockScroll`
  (C7) ; zoom/gestes inchangés.

### Nommage (règle « aucun franglais », ajoutée à CLAUDE.md)

Identifiants 100 % anglais ; français réservé aux commentaires, textes
visibles et données. Audit par balayage des identifiants contenant des mots
français → deux renommages : `StatsCartouche.astro` → `StatsPanel.astro`,
`src/lib/pictos.js` → `src/lib/icons.js` (imports et docs mis à jour).
Au passage : champ mort `extra: "fa"` retiré de `moveIcon()` (plus aucun
consommateur depuis la factorisation de `StatCells`).

## 3. Preuves de non-régression

- **Rendu** : build avant/après, comparaison **exhaustive en fréquence de
  tokens** (commentaires HTML exclus, ordre des classes normalisé, hashes
  d'assets neutralisés) sur 3 pages (HP, 2026, 2021). Différences restantes,
  toutes sans effet visuel :
  - scripts inline → modules externes hashés (le code minifié quitte le HTML) ;
  - attributs SVG morts retirés (C2) ;
  - classes de filet inertes de la cellule cachée retirées (C3) ;
  - encodage de l'onde du footer (rendu vérifié au navigateur : les deux
    segments affichent bien le SVG).
- **Fonctionnel** (dev server, mêmes tests que lors des développements) :
  deep-link `#j3` appliqué avec valeurs et bouton actif ; clic jour →
  valeurs + hash `#j1` ; ESC → totaux + hash vidé ; lightbox : ouverture +
  verrou de scroll + compteur + zoom ×2,5 au double clic ; bouton retour en
  haut présent ; HP : 5 compteurs, 2 voyageurs complets, `is-current` au
  scroll, année active mobile, 5 tirages inclinés + 40 coins d'album,
  cartouche 5 cellules dont « jours dehors » desktop seulement ; 0 requête
  en erreur.
- **Non-indexation** : intacte — meta `noindex, nofollow` (layout),
  `robots.txt` Disallow all, `X-Robots-Tag` dans `public/_headers`.
- **Build** : `npm run build` sans erreur, 6 pages.

## 4. Ce qui n'a volontairement pas bougé

- Les bibliothèques `src/lib/*.js` (mode, palette, tours, geo, dayhash,
  icons, photos) : petites, propres, partagées avec les scripts Node du
  pipeline — les typer n'apporterait rien au regard du churn.
- `TourMap.astro` : script long mais cohérent, spécifique au composant,
  chargement paresseux de MapLibre déjà optimal — le déplacer n'aurait été
  que cosmétique.
- Le pipeline `scripts/*.mjs` (hors périmètre : audité et durci en août,
  cf. historique git).
- Toutes les valeurs de design (classes, constantes d'animation, tracés).

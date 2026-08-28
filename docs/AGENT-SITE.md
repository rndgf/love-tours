# Love Tours — Brief de reconstruction : but, contenu, comportements

> Document destiné à des agents IA. Objectif : permettre de reconstruire le site
> de zéro (par exemple pour en changer le design) sans perdre ni le sens, ni le
> contenu, ni les comportements. Le pendant visuel est dans
> [AGENT-DESIGN-DNA.md](AGENT-DESIGN-DNA.md). La chaîne de données (GPX → JSON)
> est décrite dans le [README](../README.md) — elle est indépendante du site et
> réutilisable telle quelle.

## 1. But du site

- **Cadeau surprise de Renaud pour Mélanie** : un atlas privé de leurs
  itinérances d'été à deux, depuis 2021. Une année à vélo, l'autre à pied,
  en alternance.
- Ton : intime, première personne du pluriel (« nos étés », « toujours à
  deux »). Registre carnet de voyage / atlas, jamais « performance sportive »
  ni « aventure extrême » (le mot « expéditions » a été explicitement remplacé
  par « voyages »).
- Langue : français exclusivement (dates `fr-FR`, libellés, accents corrects).
- **Jamais de tiret cadratin « — » dans les textes visibles du site**
  (jugé trop « rédigé par IA ») : préférer le point, la virgule ou « · »
  (séparateur maison des titres et métadonnées).
- **Site privé** : non indexé (trois couches : `robots.txt` Disallow all,
  `<meta name="robots" content="noindex, nofollow">`, en-tête
  `X-Robots-Tag: noindex, nofollow` servi sur toutes les ressources via
  `public/_headers`, photos comprises). Accessible seulement à qui a l'URL :
  https://www.love-tours.fr (Cloudflare Pages, projet `love-tours`,
  build local + `npm run deploy`).
- **Le dépôt Git est public mais ne contient aucune photo personnelle** :
  `editions/` (sources GPX + photos) et `src/assets/tours/` (photos importées)
  sont gitignorés. Toute reconstruction doit préserver cette règle.

## 2. Pile technique actuelle (remplaçable, mais contraintes à connaître)

| Brique | Choix actuel | Contrainte à préserver |
|---|---|---|
| Générateur | Astro 7 (statique, 6 pages) | site 100 % statique, aucune API serveur |
| CSS | Tailwind 4 (`@theme` dans `src/styles/global.css`) | tokens de couleur/typo centralisés |
| Carte interactive | MapLibre GL + fond OpenFreeMap *Positron* (gratuit, sans clé) | pas de clé API, pas de quota ; prévoir `map.on("error")` → message de repli |
| Scroll lissé | Lenis ≥ 640 px | voir contraintes §5.1 |
| Images | `astro:assets` (WebP, srcset) | photos optimisées au build, jamais les originaux servis |
| CSS critique | `build.inlineStylesheets: "always"` | zéro requête CSS bloquante |
| Déploiement | `wrangler pages deploy` | `public/_headers` doit suivre |

## 3. Modèle de données (contrat d'entrée du site)

Le site consomme des fichiers générés par le pipeline (`npm run tours:all`),
qu'une reconstruction peut réutiliser sans toucher aux scripts :

- `src/data/tours/<slug>.json` — un par édition :
  - `slug` (ex. `2026-zeeland`), `year`, `title`, `mode` (**exactement**
    `"vélo"` ou `"à pied"` — toute autre valeur doit faire échouer le build,
    voir `src/lib/mode.js`), `flag` (émoji, ou sentinelle `"bzh"` pour le
    Gwenn ha Du ; tous les drapeaux sont rendus en SVG Twemoji locaux par
    `src/components/Flag.astro`, repli texte si absent du set ; le
    `<title>` d'onglet n'utilise pas le drapeau), `country`, `description`,
    `startDate`/`endDate` (ISO), `cover` (fragment de nom de fichier photo),
    `transferModes` (ex. `["ferry"]`), `bbox` `[W,S,E,N]`, `totals`
    (`distanceKm`, `days`, `gainM`, `movingS`), `days[]`.
  - Chaque `day` : `n` (numéro affiché, post-tri), `label` (`J1`…), `date`,
    `name` (nom GPX brut), `title` (titre manuel optionnel), `from`/`to`
    (toponymes géocodés), `loop` (booléen boucle), `noTrace`, `estimated`,
    `distanceKm`, `gainM`, `movingS`, `elapsedS`.
- `public/tours/<slug>.geojson` — 1 LineString par jour (propriété `day`),
  segments de transfert avec propriétés `transfer` (mode) et `dup`
  (doublon à dédupliquer à l'affichage).
- `src/data/minimaps/<slug>.json` — planche vectorielle 100×100 pré-calculée :
  `land`, `coast`, `rivers`, `topo` (bandes hypsométriques), `transfers`,
  `trace`, `start`, `end`, `loop`, `scaleUnits`, `scaleKm`.
- `src/assets/tours/<slug>/day-N/NNN_*.jpg` — photos triées/ordonnées par jour
  (préfixe `001_` = ordre chronologique).
- Éditions réelles : 2021 Loire (vélo), 2023 Cotentin (vélo), 2024 South
  England (à pied), 2025 GR34 Dinard-Erquy (à pied), 2026 Zeeland (vélo).
  Tri d'affichage : de la plus récente à la plus ancienne (`src/lib/tours.js`).

### Formatages obligatoires (`src/lib/tours.js`)

- Durées : `formatHours(s)` → `62h30` (report `m === 60` → heure suivante).
- Plages de dates : « du 11 au 16 août 2025 » (mois non répété si identique).
- Jour : « Mercredi 19 août » (capitale initiale).
- Titre d'un jour, par priorité : `day.title` manuel → « Boucle depuis X »
  (si `loop`) → « De X à Y » → nom GPX nettoyé (`stageName`) → date.

## 4. Pages et fonctionnalités

### 4.1 Homepage `/`

1. **Héro** : kicker « depuis 2021 », titre « Chaque été, une déconnexion,
   *une reconnexion*. », paragraphe d'intro. Halo de lisibilité sur le titre
   (le fond est une carte).
2. **Cartouche de stats globales** (calculées à partir des tours) :
   `voyages` (compte), `km à vélo` et `km à pied` (sommes par mode,
   séparées exprès — ne jamais fusionner), `jours dehors` (desktop
   seulement), `de dénivelé +`. Mobile : 4 cellules en 2×2.
3. **Nav des années** (mobile uniquement, sticky en haut) : liens `#y<année>`
   sur **une seule ligne à défilement horizontal** (barre masquée, liens
   centrés tant que ça tient, année active recentrée automatiquement au
   scroll de page), année active mise en évidence, voyageur miniature
   (voir §5.3). Tient sans dégradation à 13 éditions et plus.
4. **Timeline des éditions** : une carte par édition, ordre antichronologique.
   Desktop ≥ 1400 px : fil vertical pointillé à gauche avec flèche en tête
   (le voyage continue), année + point par carte, voyageur qui suit le
   scroll. Chaque carte : minimap (desktop), année en filigrane géant,
   kicker `mode · pays`, titre `drapeau + titre`, plage de dates,
   description, 3 stats (distance / dénivelé / effort), photo de couverture
   (mobile : bandeau 16/10 en tête ; desktop : carré 210 px à droite).
   Toute la carte est un lien vers la page détail.

### 4.2 Page détail `/tours/<slug>/`

1. **En-tête** : année en filigrane géant, kicker `mode · pays`, H1
   `drapeau + titre`, dates, description. Pas de fil d'Ariane (supprimé :
   le logo du header ramène à l'accueil, les flèches d'édition vivent en
   bas de page — toujours affichées, grisées `navy/25` si absentes).
2. **Cartouche de stats** (`#edition-stats`) : 4 cellules — totaux édition
   (`km / jours / m dénivelé + / effort`) ou stats du jour sélectionné
   (`km / m dénivelé + / effort / au total`, valeurs teintées à la couleur
   du jour). Voir compteurs animés §5.2.
3. **Planche cartographique** : cadre avec en-tête coordonnées du coin NO
   (`49°26′N · 1°05′E`, arrondi minutes avec report 60′), carte MapLibre
   (une couleur par jour, transferts en pointillé, dédup via propriété
   `dup`), réglette de boutons `Tout, J1…Jn` (pastille couleur par jour)
   + légende « liaison en ferry/bus » si transferts.
4. **Journal** : un article par jour — bandeau couleur du jour avec label
   `JN`, date, badge « estimé » le cas échéant (tracé planifié, temps
   extrapolés), titre du jour, 4 stats, galerie photos (1 grande + grille,
   repli « + N photos » au-delà de 9, lightbox plein écran 1600 px).
5. **Navigation bas de page** : flèches ← → centrées vers éditions
   précédente/suivante (grisées si absentes). Bouton flottant « ↑ » après
   600 px de scroll.

### 4.3 Interactions de la page détail

- Clic sur un bouton jour **ou** sur la trace du jour dans la carte :
  zoom carte sur le jour, cartouche de stats basculé sur ce jour (valeurs
  teintées), hash `#jN` posé (`history.replaceState`), bouton actif marqué.
  Si le cartouche est hors écran : remontée douce d'abord, compteurs joués
  à l'arrivée.
- `Tout` (ou touche Échap, si aucune lightbox ouverte) : retour vue complète.
- Chargement avec `#jN` : jour présélectionné (différé d'un tick — voir
  piège §5.2).
- Parse du hash : implémentation unique `src/lib/dayhash.js`.

## 5. Comportements JavaScript — contrats précis

### 5.1 Scroll lissé (Lenis)

- Actif seulement si `min-width: 640px` **et** pas de
  `prefers-reduced-motion: reduce`. Mobile : natif (+ `scroll-behavior:
  smooth` réintroduit sous 640 px pour les ancres).
- `html { scroll-behavior: smooth }` global est **interdit** avec Lenis.
- Tout scroll programmatique passe par `window.lenis?.scrollTo(cible,
  { offset })` avec repli natif ; `offset` = `scroll-margin-top` calculé de
  la cible. Un `scrollIntoView` natif se fait rattraper par la position
  interne de Lenis (bug vécu : « le scroll ne remonte plus »).
- `anchors: true` : Lenis reprend les liens d'ancre.

### 5.2 Compteurs de stats (« défilement 0 → valeur »)

- Fonction unique `window.statCountUp(el)` définie dans le layout, exposée
  **inconditionnellement** (hors reduced-motion) — même si aucun compteur
  n'existe au chargement (piège vécu : deep-link `#jN` détruit les spans
  avant l'exécution du layout).
- Comportement : le texte final est rendu côté serveur (no-JS = valeurs
  correctes). À l'animation, chaque segment de chiffres monte de 0 à sa
  valeur en 1 200 ms, décélération cubique (`1-(1-p)^3`) ; les caractères
  non numériques (« h », « . ») restent fixes ; un segment à zéro initial
  (« 05 ») garde sa largeur (padStart). Fin = réécriture du texte exact.
  Une nouvelle animation sur le même élément annule la précédente
  (`cancelAnimationFrame`).
- Déclenchement : premier affichage (IntersectionObserver, seuil 0,4) ;
  page détail : rejoué à chaque changement de jour, à l'arrivée du scroll
  si remontée nécessaire (`onComplete` Lenis + filet `setTimeout` 1 s,
  exécution unique).

### 5.3 Voyageurs de timeline (HP)

- Deux instances du même concept : pastille papier 24-28 px bordée
  `navy/30`, picto Font Awesome 14 px **cycliste carmin** (mode vélo) ou
  **randonneur sapin** (à pied) selon la carte en regard.
- Desktop ≥ 1400 px : glisse le long du fil vertical ; mobile : glisse sur
  la bordure basse de la nav des années (position = progression verticale
  dans la timeline).
- Position cible = centre du viewport, **traîne volontaire** : rattrapage à
  12 % de l'écart par frame, arrêt net sous 0,5 px. `prefers-reduced-motion`
  → placement direct.
- **Masqués quand aucune carte n'est en regard** (pas de picto par défaut
  qui recouvrirait la flèche du fil — exigence explicite).
- La carte « en regard » = celle dont la zone verticale (±16 px) contient
  le centre du viewport. Même détection pour l'année active : nav mobile
  (fond à l'accent du mode, texte papier) et, en desktop, classe
  `is-current` sur le `<li>` → l'année et le point du fil prennent l'effet
  hover (accent + zoom).

### 5.4 Divers

- Médaillon du footer : lien vers l'accueil ; déjà sur l'accueil → remontée
  douce (Lenis, repli natif) au lieu d'un rechargement. Bouton ↑ de la page
  détail : remontée douce via Lenis, repli natif.
- Lightbox : `<dialog>`, Échap natif ; l'Échap « retour carte » est inhibé
  si une lightbox est ouverte.
- Préchargement : `prefetch` Astro (`prefetchAll`, stratégie viewport).
- Toute animation continue doit être bornée ou à plage morte (voir budget
  perf dans AGENT-DESIGN-DNA.md §8).

## 6. Accessibilité et dégradations

- `prefers-reduced-motion: reduce` neutralise : Lenis, compteurs, voyageurs
  (placement direct), cœur battant, roue, sentier.
- Sans JavaScript : contenu et valeurs complets (rendu serveur), ancres
  fonctionnelles, seuls les enrichissements (zoom carte, compteurs,
  voyageurs, lightbox) disparaissent.
- Éléments décoratifs : `aria-hidden="true"` (filigranes, pictos, fils,
  voyageurs). Liens/boutons : `aria-label` explicites (retour en haut,
  navigation éditions).
- Les deux flèches prev/next sont toujours rendues (état désactivé visuel)
  pour éviter les sauts de mise en page.

## 7. Ce qui est volontairement absent

- Aucun tracker, aucune fonte externe (fontes npm auto-hébergées), aucune
  clé API, aucun cookie.
- Pas de page 404 personnalisée, pas de flux RSS, pas de sitemap (site non
  indexé).
- Pas de mode sombre.

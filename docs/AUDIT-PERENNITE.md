# Audit de pérennité — overrides, caches et heuristiques du site Love Tours

> État au commit `42983d5` (2026-08-26). Chaque constat est vérifié sur le code et référencé `fichier:ligne`. Les propositions sont regroupées en fin de document, priorisées P1/P2/P3 avec un effort estimé (S = < 1 h, M = < ½ journée, L = > ½ journée). Aucune modification de code n'accompagne cet audit.
>
> Vocabulaire : *override* = donnée saisie à la main qui prime sur une donnée calculée ; *RDP* = simplification de trace Ramer-Douglas-Peucker ; *OSRM* = routeur routier public (router.project-osrm.org) ; *Nominatim* = géocodeur inverse d'OpenStreetMap ; *bbox* = rectangle englobant d'une trace.

---

## 1. Résumé — les 5 risques majeurs

| # | Risque | Gravité |
|---|---|---|
| 1 | `npm run tours:import` lancé depuis un clone frais du dépôt **supprime les 10 fichiers de données** (`src/data/tours/*.json` + `public/tours/*.geojson`), car `editions/` est gitignoré et le script purge tout slug absent de `editions/` (`scripts/import-tours.mjs:631-643`). Récupérable uniquement par `git checkout`. | Perte de données |
| 2 | Le dépôt contient **les sorties mais pas les entrées** : `editions/` (fichiers GPX + les 5 `edition.json`, seule source des transferts, `dayTitles`, `statsOverrides`, `extraDays`, coordonnées manuelles) n'est versionné nulle part (`.gitignore:7`). Sa perte rend le pipeline non rejouable. | Perte de données |
| 3 | `day.from` / `day.to` (toponymes géocodés, affichés en titre « De X à Y ») sont **détruits à chaque `tours:import`** et ne reviennent que si l'on relance `tours:geocode` à la main. Oubli = les titres retombent sur les noms bruts des traces GPX, sans aucun avertissement. | Régression silencieuse |
| 4 | La clé de cache OSRM n'encode que les numéros de jour (`scripts/import-tours.mjs:567`) : **corriger une coordonnée de transfert dans `edition.json` n'a aucun effet** (l'ancien tracé est resservi). À l'inverse, ajouter un `extraDay` renumérote les jours et invalide tous les caches d'un coup. | Incohérence silencieuse |
| 5 | Le discriminant de mode est la **chaîne littérale accentuée `"vélo"`, comparée par `===` en 6 endroits** (détail §5). Un renommage (`"Vélo"`, `"velo"`, normalisation Unicode) ou un nouveau mode (« kayak ») bascule tout le site sur l'accent sapin, sans erreur ni avertissement. | Régression silencieuse |

---

## 2. Overrides et données manuelles

### 2.1 Inventaire par édition (`editions/*/edition.json`, non versionnés)

| Édition | Overrides déclarés |
|---|---|
| 2021 La Loire | `extraDays` (veille du départ), `transfers` (train, coordonnée en dur `[0.4059, 47.3246]` = gare de Langeais), `dayTitles` (`{"5": "Retour à Villandry"}`), `tzOffsetHours`, `cover` |
| 2023 Cotentin | `plannedDays` (jour 1 marqué estimé), `tzOffsetHours`, `cover` |
| 2024 South England | `statsOverrides` jours 1→7 (13 valeurs `gainM`/`lossM` saisies à la main, D+ absent des exports komoot), `transfers` (train avec coordonnée maison en dur `[1.09281, 49.4239]`, 2 ferries `direct`), `tzOffsetHours: 1`, `cover` |
| 2025 GR34 | `extraDays` (retour en bus), `transfers` (2 bus routés OSRM), `tzOffsetHours`, `cover` |
| 2026 Zeeland | `statsOverrides` jours 1→6, `transfers` (2 ferries `direct` avec coordonnée Breskens en dur `[3.5686, 51.406]` ×2), `tzOffsetHours`, `cover` |

Total : **5 coordonnées en dur**, jamais validées contre un référentiel. La coordonnée « maison » de 2024 (`49.4239`) diverge de 1,6 km de la constante `HOME` de `scripts/gen-background.mjs:19-20` (`49.409`) : deux sources de vérité pour la même donnée.

### 2.2 Overrides de géocodage (`data/geocode-overrides.json`)

6 entrées : `Zanddijk→Veere`, `Tipner→Portsmouth`, `Portslade by Sea→Brighton`, `Itchen Abbas→Winchester`, `Hindhead→Haslemere`, `South Heighton→Newhaven`.

- **Clé = le toponyme renvoyé par Nominatim** (`scripts/geocode-stages.mjs:39-42`), c'est-à-dire une donnée OpenStreetMap vivante. Si Nominatim change sa réponse pour la coordonnée (édition OSM, changement de zoom, réordonnancement des champs `village/town/city`), l'override **ne matche plus et échoue en silence** : le site affiche « De Tipner à Itchen Abbas ».
- **Overrides globaux, non scopés** : `"Tipner": "Portsmouth"` s'applique à n'importe quelle coordonnée du monde répondant « Tipner », toutes éditions confondues.
- La chaîne de repli `village || town || city || municipality || hamlet || suburb || null` (`geocode-stages.mjs:33`) est elle-même une heuristique en dur.

### 2.3 Cache de géocodage (`data/geocode.json`)

- Clé = coordonnée arrondie au 1/1000° (~110 m) du **premier/dernier point de la trace simplifiée** (`geocode-stages.mjs:24`). Or ces points bougent de quelques mètres à chaque ré-import (la simplification RDP dépend du GPX). **Dérive déjà prouvée** : le cache contient 6 paires de clés voisines pour le même lieu (ex. `"51.650,3.922"` / `"51.653,3.931"` / `"51.651,3.920"` → tous « Zierikzee »). Chaque ré-import peut donc relancer des requêtes Nominatim.
- `if (cache[k] !== undefined)` (`geocode-stages.mjs:28`) : un échec (`null`) est mis en cache **définitivement**, jamais réessayé.

### 2.4 Double régime de numérotation des jours (piège latent)

Trois mécanismes indexent les jours par numéro, mais **pas dans le même espace** :

1. `statsOverrides` est appliqué **avant** l'insertion des `extraDays` et le re-tri chronologique (`scripts/import-tours.mjs:491-494`).
2. `dayTitles` et `transfers` sont appliqués **après** (`import-tours.mjs:548`, `:610`), sur la numérotation re-triée (`:516-521`).

Aujourd'hui aucune édition ne combine `extraDays` + `statsOverrides`, donc pas de bug visible. Ajouter un prologue (`extraDay`) à 2024 ou 2026 décalerait `dayTitles`/`transfers` d'un cran **sans toucher `statsOverrides`** — incohérence silencieuse garantie. Cas réel déjà en place : sur 2021, l'`extraDay` du 6 août se classe en tête, donc `"dayTitles": {"5": ...}` et `fromDay: 5` visent le **dernier jour tracé**, pas le 5ᵉ jour de marche. Supprimer cet `extraDay` décalerait tout, en silence.

### 2.5 Cache des transferts (`data/transfers/*.json`)

- Nom de fichier : `<slug>-<fromDay|"pt">-<toDay|"pt">.json` — voir risque n°4 du résumé (clé sans coordonnées).
- Contenu : la **réponse OSRM brute et complète** (~130 Ko versionnés), dont les champs `hint` opaques liés à une version du graphe OSRM. Seul `routes[0].geometry` est lu (`import-tours.mjs:574`).
- Échec OSRM (`code !== "Ok"`, service indisponible) → `continue` avec un simple `console.warn` (`:571`) : **la feature de transfert disparaît du geojson** sans erreur bloquante. Le `fetch` n'est pas protégé par `try/catch` : une coupure réseau fait crasher l'import au milieu, laissant les éditions dans un état mixte.
- Vérifié : les geojson publiés sont bien la sortie littérale du script (aucun patch manuel ; nombre de points des caches = nombre de points des features).

### 2.6 `dayTitles` — preuve empirique de la fragilité du fallback

Le seul `title` manuel du corpus (« Retour à Villandry », 2021 J5) existe **parce que** le fallback automatique aurait affiché « Boucle depuis Angers » pour un retour en train (`day.from === day.to` sur les toponymes, voir §4.1). L'override est le pansement d'une heuristique qui a déjà échoué une fois sur cinq éditions.

---

## 3. Pipeline non orchestré

- 4 scripts de génération, **2 seulement exposés en scripts npm** (`tours:import`, `tours:geocode`). `gen-minimaps.mjs` et `gen-background.mjs` s'invoquent à la main ; l'ordre complet (import → geocode → minimaps → background → build) n'est documenté qu'en prose (`README.md`, `CLAUDE.md`).
- **Oublis à échec silencieux** : nouvelle édition sans `gen-minimaps` → mini-carte absente sur la homepage (le composant rend `null`, la colonne de 210 px reste vide, `src/components/MiniMap.astro:17-21`) ; sans `gen-background` → filigrane de fond figé sur les anciennes traces.
- `npm run build` et `npm run deploy` **ne dépendent d'aucune étape de données** : on peut déployer un site aux geojson/minimaps désynchronisés sans signal.
- `data/naturalearth/` (28 Mo) est gitignoré alors que ses sorties (`src/data/minimaps/*.json`, `src/components/BackgroundMap.astro`) sont versionnées : les `gen-*` **plantent sur un clone frais** (`readFileSync` sans garde, `scripts/gen-minimaps.mjs:22`).
- `BackgroundMap.astro` est **du code source généré et committé** (16,6 Ko, bandeau « ne pas éditer »), écrasé sans avertissement au prochain run ; son centre dépend des transferts (`gen-background.mjs:25-42` n'exclut pas les features `transfer`, contrairement au dessin `:108`) : ajouter un transfert déplace le centre du fond.
- Filtre de fleuves par nom littéral `["Seine", "Loire"]` (`gen-background.mjs:126`) sur un jeu Natural Earth non épinglé en version : un renommage du champ vide le calque sans erreur.
- Dépendances non déclarées : `sharp` importé (`import-tours.mjs:19`) mais absent de `package.json` (présent seulement en transitif d'Astro) ; `exiftool` binaire système requis pour les photos HEIC, absence dégradée en silence.
- `src/data/minimaps/` n'est pas purgé par l'import (boucle `:638`) : minimaps orphelines possibles.

---

## 4. Heuristiques fragiles côté site

### 4.1 Trois définitions concurrentes de « boucle »

| Endroit | Définition | Conséquence |
|---|---|---|
| Titre de jour (`src/pages/tours/[slug].astro:209-215`) | `day.from === day.to` (égalité de chaînes de toponymes) | « Boucle depuis Angers » pour un retour en train (déjà arrivé, §2.6) |
| Carte détail (`src/components/TourMap.astro:154-159`) | distance départ/arrivée < 500 m | Marqueur unique « DÉPART · ARRIVÉE » |
| Mini-carte (`src/components/MiniMap.astro:38-40`) | **aucune** | Sur 2023 et 2026 (boucles), le point départ est intégralement recouvert par le point arrivée : un seul rond creux, illisible |

Divergence supplémentaire sur 2021 : la mini-carte termine à Angers (fin du J5), la carte détail termine près de Tours (fin du train, `postTransfer`). **Deux arrivées différentes pour la même édition.**

### 4.2 Marqueurs départ/arrivée avec transferts (`TourMap.astro:145-153`)

- `toDay === 1` en dur : une édition combinant prologue `noTrace` **et** transfert d'approche produirait `toDay: 2` → marqueur départ silencieusement faux.
- Le bus retour 2025 (`fromDay: 5, toDay: 1`) n'échappe au filtre `preTransfer` que parce que `fromDay` n'est pas `null` — à un champ près, le départ serait téléporté à l'arrivée.
- `traced.at(-1)` et `traced[0]` sans garde : édition sans jour tracé → `TypeError` avalé dans le `map.on("load", async)` → carte blanche sans message.
- Géométrie présumée `LineString` : un transfert `MultiLineString` (train avec correspondance) donnerait un marqueur `NaN`.

### 4.3 Seuils et palette

- **Seuil « même étape » 500 m** (`TourMap.astro:180`) : la jonction 2026 J2→J3 mesure **677 m** (même ville, Zierikzee) — 35 % de marge avant de basculer de 2 points à 1. Même valeur 500 utilisée pour la détection de boucle (`:159`) avec une autre sémantique ; constante `111320` (m/degré) répétée 2 fois sans être nommée.
- **Palette 8 couleurs modulo** (`src/lib/palette.js`) : un 9ᵉ jour reprend la couleur du jour 1 (trace, légende, stats identiques, sans avertissement). 2024 fait déjà 7 jours ; les jours `noTrace` consomment un index (2021 : `n` max = 5 pour 4 traces). **Marge restante : 1 jour.**
- **Dédup du label FERRY par accident** : 2026 contient 2 features ferry géométriquement identiques inversées ; un seul label s'affiche uniquement grâce à la détection de collision par défaut de MapLibre, et la ligne pointillée est dessinée 2 fois (opacité 0,55 composée ≈ 0,80 : ce transfert paraît plus foncé que les autres). Comportement non garanti d'une version de MapLibre à l'autre.

### 4.4 Formatage

- **`formatHours` peut afficher « 0h60 »** : `3599 s` → `h=0`, `m=Math.round(59.98)=60` (`src/lib/tours.js:12`). Le bug existe **en double** : copie cliente dans `[slug].astro:330` (fonction `fh`). Se déclenche pour toute durée dans les 30 dernières secondes d'une heure ; non observé sur les données actuelles, retiré au sort à chaque nouvelle édition.
- **Coordonnées « 47°60′N » possibles** : même défaut d'arrondi dans `fmtCoord` (`[slug].astro:27-33`) pour une bbox à ≥ X.9992°.
- **Élision fausse** : `/^[aeiouyàâéèêëîïôùûh]/i` traite tout `h` comme muet → **« D'Haslemere » déjà affiché en production** (2024 J4, h aspiré) ; aucune contraction d'article (« De Le Havre » au lieu de « Du Havre »).
- `formatRange` : la branche « années différentes » omet l'année de départ (`DATE_FMT` sans année, `tours.js:16`) — faux pour un tour à cheval sur deux années.

### 4.5 Couplages et duplications

- **`fs.readFileSync("public/tours/<slug>.geojson")` en chemin relatif au cwd** dans le frontmatter (`[slug].astro:36-38`), pour extraire 1 à 2 chaînes (`["ferry"]`…). Casse si le build est lancé d'ailleurs ; hors du graphe Vite (pas de HMR) ; double voie d'accès au même fichier (le `fetch` de `TourMap.astro:48` suit `BASE_URL`, le `readFileSync` non).
- **Deux parseurs du hash `#jN`** : `[slug].astro:359` et `TourMap.astro:278`, même regex dupliquée, validations différentes.
- **Cellules de stats couplées par index** : le script client écrit `rows[i]` dans `cells[i]` (`[slug].astro:331`) ; ajouter une 5ᵉ statistique au cartouche sans toucher le script désynchronise ou crashe.
- **Bug actuel : ESC dans la lightbox réinitialise la carte.** Le `keydown` ESC est capté au niveau `document` (`[slug].astro:362-364`) ; le ESC natif du `<dialog>` bulle jusqu'à lui : fermer une photo remet la carte sur « Tout » et efface le hash.
- **Course au chargement** : les puces jour sont écoutées immédiatement, la carte seulement après `IntersectionObserver` + `map.on("load")` — un clic précoce met à jour cartouche et hash sans zoomer la carte.
- **La légende pointillée ne ressemble pas à ce qu'elle légende** : `stroke-dasharray="0.5 5"` dans le SVG de légende (`[slug].astro:170`) vs `line-dasharray: [0.5, 2.2]` sur la carte (`TourMap.astro:88`).
- **`MiniMap` a un défaut `mode = "vélo"`** (`MiniMap.astro:14`) alors que `[slug].astro:23` n'en a pas : une édition sans champ `mode` serait carmin en homepage et sapin en page détail.
- **`history.replaceState(null, "", location.pathname)`** (`[slug].astro:350`) écrase toute query string existante.

### 4.6 Dépendance externe au runtime

**OpenFreeMap** (`https://tiles.openfreemap.org/styles/positron`, `TourMap.astro:38`) est la seule dépendance runtime du site : URL en dur, service gratuit sans engagement, **sans repli ni `map.on("error")`**. Indisponible → toutes les cartes des pages détail sont vides, sans message. Le glyphe de flèche `"▶"` dépend en plus du jeu de polices de ce style.

### 4.7 Divers homepage / layout

- Timeline : le motif SVG (période 120 px, `index.astro:87`) n'a **aucune relation** avec la position des pastilles (cartes à hauteurs variables, `space-y-8`) — alignement purement décoratif ; à corriger dans les têtes avant toute tentative « d'aligner » quoi que ce soit. Seuil `min-[1400px]` répété 3 fois ; à 1400 px exactement, le libellé d'année passe à 16 px du bord.
- Entre 640 px et 1400 px, **aucun accès direct à une année** (nav sticky mobile-only, libellés desktop `aria-hidden` et ≥ 1400 px seulement).
- Favicon : SVG en data-URI avec `#1e2f4d`/`#faf6ee` en dur, désynchronisables de `--color-navy`/`--color-paper` ; réémis dans chaque page.
- `site: "https://love-tours.example.com"` dans `astro.config.mjs:5` : **placeholder jamais renseigné** — toute URL absolue générée (canonical, OG, sitemap) pointerait vers example.com.
- Clone frais du dépôt public : `src/assets/tours/` gitignoré → **aucune photo**, toutes les cartes homepage basculent en 2 colonnes, tandis que les compteurs continuent d'annoncer « 127 photos ».
- `coverFor` cherche `tour.cover` par sous-chaîne de chemin et retombe **silencieusement** sur la première photo si absent (`src/lib/photos.js:22`).
- Clé de lightbox `"<slug>-day-<n>"` reparsée par regex `/day-(\d+)$/` : couplage par format de chaîne ; un slug contenant `day-12` fausserait le compteur.

---

## 5. La discrimination par `mode` — 6 sites + 1 inférence

| # | Endroit | Expression |
|---|---|---|
| 1 | `src/pages/index.astro:92` | `tour.mode === "vélo" ? "text-carmin" : "text-sapin"` |
| 2 | `src/pages/tours/[slug].astro:23` | idem |
| 3 | `src/pages/tours/[slug].astro:25` | variante `hover:` |
| 4 | `src/components/MiniMap.astro:15` | variante CSS var + **défaut `"vélo"`** |
| 5 | `src/lib/tours.js:8` | `modeIcon` (code mort) |
| 6 | `scripts/gen-background.mjs:135` | choix du bucket carmin/sapin |

Production de la valeur : `scripts/import-tours.mjs:386` — inférée par regex anglophone (`/bike|bicycle|velo|vélo|cycling/i`) sur le champ `<type>` du **premier GPX seulement**, tout le reste devient « à pied ».

Toute évolution (nouveau mode, renommage, désaccentuation lors d'une édition manuelle du JSON) demande 6 modifications dans 5 fichiers dont un script Node hors bundle, et échoue **en silence** (bascule sur la branche `else` = sapin). Aucune constante partagée, aucune validation à l'import.

---

## 6. Code mort

- `modeIcon` (`src/lib/tours.js:8`) — importé par `[slug].astro:8`, jamais appelé.
- `src/components/TraceThumb.astro` — aucun import dans `src/`.
- Champ `thumb` des 5 JSON de tours — jamais lu (servait à TraceThumb).
- `--color-love` (`src/styles/global.css:14`) — duplique `--color-carmin`, jamais référencé.
- `.atlas-grid` (`global.css:35`) — seul usage dans le composant mort.
- `const NAVY` (`TourMap.astro:34`) — définie puis contournée par le littéral `"#1e2f4d"` écrit 4 fois plus bas.
- Chemins de code jamais exercés : `plannedDays[].startAt*`, `meta.mode` explicite (`import-tours.mjs:386, 450-457`).

---

## 7. Grille de lecture : déclencheur → casse

| Déclencheur | Ce qui casse | Réf. |
|---|---|---|
| Clone frais + `tours:import` | **Suppression des 10 fichiers de données** | §1.1 |
| Perte du dossier `editions/` | Pipeline non rejouable (overrides perdus) | §1.2 |
| Ré-import sans re-geocode | Titres de jour dégradés, silencieux | §1.3 |
| Correction d'une coordonnée de transfert | Aucun effet (cache OSRM resservi) | §2.5 |
| Ajout d'un `extraDay` à 2024/2026 | `dayTitles`/`transfers` décalés, `statsOverrides` non | §2.4 |
| Changement de réponse Nominatim | Override de toponyme inopérant, silencieux | §2.2 |
| Nouvelle édition sans `gen-*` manuels | Mini-carte absente, filigrane figé | §3 |
| 9ᵉ jour (ou 8 jours + prologue) | Deux jours de la même couleur | §4.3 |
| Nouveau mode / renommage de `"vélo"` | Tout le site passe au sapin | §5 |
| Toponyme à h aspiré ou article | « D'Haslemere » (déjà en prod), « De Le Havre » | §4.4 |
| Durée dans les 30 dernières s d'une heure | « 0h60 » (bug en double) | §4.4 |
| ESC pour fermer une photo | Carte et hash réinitialisés (**bug actuel**) | §4.5 |
| OpenFreeMap indisponible | Cartes détail vides, sans message | §4.6 |
| Build depuis un autre cwd | `ENOENT` sur le geojson | §4.5 |

**Régénérable** (si `editions/` + `data/naturalearth/` disponibles) : tours JSON, geojson, minimaps, background, photos optimisées, `day.title`.
**Manuel / perdable** : les 5 `edition.json` et GPX (hors dépôt), `day.from`/`to` (détruits à chaque import), overrides de géocodage (clé instable), caches transferts (clé fragile), `statsOverrides` (saisie humaine sans source tracée).

---

## 8. Propositions d'amélioration

### P1 — Protéger les données (risque de perte)

| Proposition | Effort |
|---|---|
| Garde anti-purge dans `import-tours.mjs` : refuser de supprimer quoi que ce soit si 0 édition importée (`if (!slugs.length) throw`), et réserver la suppression à une option explicite `--prune`. | S |
| Versionner les 5 `edition.json` dans le dépôt (ex. `data/editions/<slug>.json`) — fichiers texte de quelques Ko, sans GPX ni photo personnelle, donc compatibles avec la règle de confidentialité du projet. À défaut : documenter dans le README où vit la sauvegarde des `editions/`. | S |
| Enchaîner geocode après import (`"tours:import": "node scripts/import-tours.mjs && node scripts/geocode-stages.mjs"`) pour que `day.from`/`to` ne restent jamais absents. | S |

### P2 — Fiabiliser les overrides

| Proposition | Effort |
|---|---|
| Clé de cache OSRM incluant les coordonnées arrondies des deux extrémités → toute correction de coordonnée déclenche un recalcul ; toute renumérotation de jour n'invalide plus rien. | S |
| Overrides de géocodage scopés par coordonnée (même clé `lat,lon` que le cache) au lieu du toponyme Nominatim ; au minimum, avertir quand un override ne matche plus aucun résultat. | S |
| Unifier la numérotation : appliquer `statsOverrides` après le tri/renumérotation, comme `dayTitles`/`transfers` ; écrire dans le README que tous les numéros d'`edition.json` sont post-tri. | M |
| Une seule constante « maison », partagée entre `gen-background.mjs` et l'édition 2024. | S |
| Ne mettre en cache que `routes[0].geometry` de la réponse OSRM (130 Ko → ~15 Ko versionnés). | S |
| Protéger le `fetch` OSRM (`try/catch`) et échouer bruyamment (exit code ≠ 0) quand une feature de transfert ne peut pas être générée. | S |

### P3 — Réduire les fragilités du site

| Proposition | Effort |
|---|---|
| Module unique `src/lib/mode.js` (`MODES` énuméré, `accentFor(mode)`, validation à l'import) remplaçant les 6 ternaires `=== "vélo"`. | M |
| Stocker `transferModes` dans `src/data/tours/*.json` à l'import → supprimer le `fs.readFileSync` du frontmatter de `[slug].astro`. | S |
| Une seule implémentation de `formatHours` et du parseur `#jN` (module partagé serveur/client) ; corriger les arrondis « 0h60 » (`m === 60 → h+1, m=0`) et « 47°60′ ». | S |
| ESC : ignorer le raccourci si un `<dialog>` est ouvert (corrige le bug lightbox actuel). | S |
| Élision : abandonner « D' » (toujours « De X à Y ») ou table d'exceptions (h aspiré, articles Le/Les → Du/Des). L'abandon est plus sûr : zéro maintenance. | S |
| Orchestration : script npm `tours:all` (import → geocode → minimaps → background) + garde `existsSync` sur `data/naturalearth/` avec message indiquant comment retélécharger. | S |
| Palette : passer à 12 couleurs distinctes ou avertir au build quand `n` dépasse la taille de la palette. | S |
| Une seule définition de « boucle » (celle de TourMap, < 500 m), partagée avec le titre de jour et la mini-carte (marqueur combiné sur MiniMap). | M |
| `map.on("error")` + message de repli dans le conteneur carte quand le style OpenFreeMap ne charge pas. | S |
| Renseigner `site` dans `astro.config.mjs` (`https://love-tours.fr`). | S |
| Supprimer le code mort du §6. | S |
| Dédupliquer les 2 features ferry identiques de 2026 à l'import (une seule feature, un seul label garanti). | S |

Priorisation suggérée : tout P1 d'abord (3 changements S, élimine les deux risques de perte de données), puis les deux premières lignes de P2 (clés de cache), puis P3 au fil de l'eau.

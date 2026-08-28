# Love Tours — ADN visuel et graphique

> Document destiné à des agents IA. Il fige l'identité visuelle construite
> jusqu'ici, avec les valeurs exactes, pour permettre une reconstruction ou un
> redesign qui sache ce qu'il conserve et ce qu'il casse. Le brief fonctionnel
> est dans [AGENT-SITE.md](AGENT-SITE.md). Source de vérité en cas de doute :
> le code (`src/styles/global.css`, `src/layouts/Base.astro`, `src/pages/`,
> `src/components/`, `src/lib/`).

## 1. Concept directeur

**Atlas d'été gravé sur papier.** Le site imite une planche d'atlas ancien /
carnet de voyage imprimé : fond papier crème, encre marine, filets fins,
cartouches de relevés, coordonnées en marge, pointillés de sentier. Les
couleurs d'accent y jouent des rôles **volontairement distincts** : les
**modes de déplacement** — carmin = vélo, sapin = à pied — qui teintent les
données ; la **signature amoureuse** du site (cœurs, « & », `::selection`)
en framboise, qui ne colore jamais une donnée ; l'**accent générique**
(hovers, liens, états actifs hors mode) en laiton. Tout le reste est navy
sur papier. Tout élément nouveau doit répondre
à la question : « est-ce qu'on pourrait le trouver sur une carte imprimée ? »

## 2. Palette (tokens `@theme`, `src/styles/global.css`)

| Token | Hex | Rôle exact |
|---|---|---|
| `--color-paper` | `#faf6ee` | fond général, pastilles, texte sur accent |
| `--color-paper-deep` | `#f0e9d8` | fonds enfoncés (badge « estimé », bouton actif) |
| `--color-ink` | `#23201a` | texte courant |
| `--color-ink-soft` | `#7a7160` | texte secondaire (descriptions, dates) |
| `--color-navy` | `#1e2f4d` | **structure** : bordures, filets, labels, pictos, filigranes |
| `--color-carmin` | `#b3402f` | **mode vélo** (données : traces, stats, voyageur) |
| `--color-sapin` | `#3e6b4f` | **mode à pied** |
| `--color-framboise` | `#a63d6f` | **signature amoureuse** : cœurs du logo (header et médaillon footer), « & » du header, `::selection` 25 % |
| `--color-laiton` | `#8f6b1f` | **accent générique** : hovers de liens hors navigation d'édition, états actifs hors mode |

Couleurs hors tokens, utilisées dans les cartes générées :
- eau (mer, rivières) : `#3f7fb5` (mer en aplat très dilué, voir §7) ;
- bandes hypsométriques : `#c9a227` (ocre doré).

**Règle sémantique (décision explicite)** : quatre rôles étanches — la
framboise aux signes d'amour, le carmin au vélo, le sapin à la marche, le
laiton aux accents génériques (hovers, actifs). Toute **donnée** colorée
l'est par son mode ou par sa couleur de jour ; les valeurs neutres (stats
globales, kicker) sont **navy**. Exception assumée : les liens vers une
édition (prev/next) prennent au hover l'accent du mode **cible**.

**Palette des jours** (`src/lib/palette.js`, traces de la carte détail,
bandeaux et valeurs du journal) — 12 couleurs, cyclique avec avertissement :
`#cf3f56` rose profond, `#e07a3f` terracotta, `#c9a227` ocre doré,
`#4f9d69` vert amande, `#3f7fb5` bleu mer, `#7f5ba6` mauve, `#d15f8e` rose
clair, `#3aa6a6` sarcelle, `#8a5a44` brun cacao, `#7a8a3a` olive,
`#6e3a5e` aubergine (ex-framboise, cédée à la signature amoureuse),
`#46628f` bleu ardoise.

Opacités récurrentes de la structure navy : bordures fortes `border-navy`
(cadres, filets de cartouche à 20 %), bordures douces `/30`–`/40` (cartes,
boutons), désactivé `/25`, grilles de minimap `/10`, filigrane année
`/[0.045]`.

## 3. Typographie

Trois familles, toutes auto-hébergées (npm `@fontsource`) :

| Famille | Usage | Classes |
|---|---|---|
| **Fraunces Variable** (serif éditoriale) | titres, années, wordmark, coordonnées | `font-display`, `font-semibold`, `tracking-tight` |
| **Inter Variable** | texte courant | défaut `body` |
| **IBM Plex Mono** 400/500/700 | **tout ce qui est « donnée » ou « instrument »** : stats, labels, kickers, boutons, nav, footer | `font-mono` |

Codes typographiques :
- Les labels/kickers mono sont TOUJOURS en `uppercase` + lettrage large :
  `tracking-[0.1em]` (boutons) à `tracking-[0.3em]` (kicker héro), cœur de
  gamme `0.14em`–`0.2em`.
- Micro-typo assumée : labels de stats `text-[8px]`/`text-[9px]`, valeurs
  `text-[11px]`/`text-[12px]` (cartes/journal) et `text-2xl sm:text-3xl`
  (cartouches dl). Kickers `text-[10px]`.
- Années en filigrane : `text-[6.5rem]` à `text-[15rem]`, `text-navy/[0.045]`,
  `font-display font-semibold`, centrées derrière le contenu,
  `pointer-events-none select-none`.
- **Échelle globale desktop : `html { font-size: 90% }` dès 640 px** — rendu
  « plus fin, façon planche gravée ». Mobile reste à 16 px. Les tailles en
  `px` arbitraires ne sont pas affectées, les `rem` oui.
- Emphase italique dans les titres du héro (`<em>une reconnexion.</em>`).

## 4. Logo et signes

**LogoMark** (`src/components/LogoMark.astro`, viewBox 36×36) :
- roue de vélo : pneu `r=13 stroke-width=2`, jante `r=10.6 sw=0.9`,
  12 rayons `sw=0.7` depuis le moyeu `(18,16)` — tout en navy ;
- cœur framboise plein au moyeu (path `M18 22.5 C12.5 18 … Z`) ;
- sentier pointillé sous la roue : `M3 33.5 Q10 30.5 18 32.5 T33 31.5`,
  navy 60 %, `stroke-width 1.6`, `dasharray 2.5 3` (période 5,5).
- Usages : header (48 px, à gauche du wordmark) et médaillon du footer
  (56 px, pastille papier `p-1.5` rounded-full, lien retour en haut).
- Wordmark header : « Mélanie **&** Renaud » (Fraunces semibold) sur
  « LOVE TOURS » (mono 10 px, `tracking-[0.22em]`, compensé par
  `text-indent`). Le « & » est framboise.
- Favicon distinct : pastille navy, cœur papier (un seul signe, lisible en
  16 px — data-URI dans `Base.astro`).

## 5. Motifs graphiques récurrents

1. **Cartouche de relevés** (`<dl>` stats HP et détail — jumeaux exacts) :
   `border-y border-navy` (1 px), colonnes égales séparées par filets
   `border-navy/20`, cellules `px-3 py-4 sm:px-4 sm:py-5` centrées,
   valeur mono `text-2xl sm:text-3xl font-medium` (+ unité en
   `text-base sm:text-lg` collée), label mono `mt-1 text-[9px] uppercase
   tracking-[0.18em] text-navy`. Fond : dégradé blanc
   `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 14%,
   rgba(255,255,255,0.6) 86%, transparent 100%)` (pas de bordures latérales
   → le fond s'évanouit sur les côtés).
2. **Cellule de stat compacte** (cartes HP, journal) : picto 14 px au-dessus
   (aplat navy, aligné sur la ligne de base par
   `preserveAspectRatio="xMidYMax meet"`), valeur `text-[11px]/[12px]
   font-medium` colorée (accent du mode ou couleur du jour), label
   `text-[8px] uppercase tracking-[0.14em] text-navy`. Toujours en
   **colonnes égales** avec filets `border-l border-navy/20` (grid, jamais
   de flex au contenu — les blocs « tassés à gauche » ont été explicitement
   corrigés).
3. **Planche cartographique** : cadre `border-2 border-navy` sur fond
   `bg-white/80`, bandeau titre (coordonnées NO en Fraunces), pied avec
   réglette de boutons et légende.
4. **Pointillé cartographique** : partout où une liaison/un chemin est
   évoqué — pointillés courts à intervalles longs, `stroke-linecap="round"`.
   Valeurs canon : fil de timeline `dasharray 0.5 6.5, sw 1.6, navy 60 %`
   (motif sinueux répété, largeur 36) ; bordure du footer : **onde
   irrégulière** (pas de motif régulier — exigence explicite), path
   `M0,10 C40,2 70,16 110,9 C150,3 185,18 230,12 C275,6 300,3 350,11
   C395,18 430,4 480,7 C525,10 565,15 600,10` sur 600×20, même dasharray,
   opacité 50 %, en deux segments + arc `M2 36.5 A36 36 0 0 1 74 36.5`
   (76×38) qui épouse le médaillon sans l'entourer.
5. **Filigrane d'année** : année géante quasi invisible derrière chaque carte
   et chaque en-tête de page détail (voir §3).
6. **Cartes bordées** : contenus posés sur `bg-white/75` avec
   `border border-navy/40`, hover `border-navy + shadow-lg shadow-navy/5`.
7. **Boutons-instruments** (jours, « + N photos ») : mono uppercase 9-10 px,
   `border border-navy/30 bg-paper`, hover `border-navy`, actif
   `border-navy + bg-paper-deep`, cible tactile `min-h-[30px]` en mobile.

## 6. Iconographie

- **Font Awesome Free 6** (licence CC BY 4.0), tracés embarqués en dur dans
  `src/lib/pictos.js` (`route`, `mountain`, `clock`) et `src/lib/mode.js`
  (`person-biking`, `person-hiking`) — pas de dépendance ni de fonte.
- Rendu : aplat `fill-navy` (ou couleur d'accent pour les voyageurs),
  **14 px partout**, `viewBox` propre à chaque icône,
  `preserveAspectRatio="xMidYMax meet"` pour ancrer les glyphes en bas.
- Correspondance stats : distance→`route`, dénivelé→`mountain`,
  effort→cycliste ou randonneur **selon le mode**, au total→`clock`.
- Flèches de navigation : caractères texte `←`/`→` (pas d'icônes), gros
  (`text-4xl`) en bas de page détail, `text-navy/60` hover accent du mode
  **cible**, désactivé `text-navy/25`.

## 7. Cartographie générée (identité des fonds)

- **Minimaps** (`src/components/MiniMap.astro`, viewBox 100×100) : mer
  `#3f7fb5` à 12 %, terre = papier, bandes hypsométriques ocre
  `fill-opacity 0.07 + i×0.06` (seuils 60/120/180 m), côtes `navy/40
  sw 0.7`, rivières `#3f7fb5` 50 % `sw 0.5`, graticule `navy/10 sw 0.4`
  (quarts), transferts pointillés `navy/50 sw 0.9 dasharray 0.7 2.2`,
  **trace en double trait** : halo papier `sw 2.6` à 90 % sous trait accent
  du mode `sw 1.4`. Départ : point plein accent `r 2` ; arrivée : point
  papier cerclé accent ; boucle : point + anneau concentrique `r 3.8`.
  Échelle graphique en bas à gauche (`N km`), nord en haut à droite.
- **Fond de site** (`BackgroundMap.astro`, SVG inline ~41 Ko, fixé plein
  écran en `-z-10`, `pointer-events-none`) : mêmes ingrédients plus dilués —
  mer 7 %, rivières 30 %, hypso 2/3,5/5 %, côtes et traces des cinq voyages,
  centré sur la maison (Sotteville-lès-Rouen, constante partagée
  `scripts/lib/home.mjs`) — **sans marqueur de départ** (retiré : « aucun
  intérêt »). Le contenu passe au-dessus ; le héro porte un halo
  `text-shadow: 0 0 3px/10px/24px rgba(250,246,238,1)` pour rester lisible.
- **Carte interactive** (page détail) : style OpenFreeMap *Positron*
  (fond neutre clair), une couleur de la palette des jours par trace,
  transferts pointillés étiquetés (FERRY/BUS), filtre des doublons `dup`.

## 8. Mouvement (inventaire exhaustif)

Doctrine : le mouvement raconte le voyage (roue qui tourne, sentier qui
défile, voyageur qui avance, compteurs de bord) — jamais de décoratif
gratuit. **Budget perf explicite** : aucune animation permanente sans plage
morte ; boucles rAF bornées ou auto-arrêtées ; `prefers-reduced-motion`
neutralise tout (cf. AGENT-SITE.md §6).

| Animation | Déclencheur | Valeurs exactes |
|---|---|---|
| Cœur qui bat (`seal-beat`) | permanent (header + footer) | cycle 4 s : double battement scale 1→1.14→1→1.1→1 entre 0 et 22 %, **repos 22→100 %** (~78 % sans repaint) ; origine `18px 16px` ; `will-change: transform` |
| Roue qui tourne (`seal-spin`) | hover/focus du logo | rotation 360° linéaire 1,4 s infinie |
| Sentier qui défile (`seal-walk`) | hover/focus du logo | `stroke-dashoffset` 0→−5.5 (une période) linéaire 0,7 s |
| « & » → cœur | hover du logo header | fondu croisé 0,25 s entre `&` et `❤︎` (U+2764 + VS15, même framboise), le cœur bat |
| Voyageurs timeline | scroll | traîne lerp 12 %/frame, arrêt < 0,5 px ; masqués hors cartes |
| Année active (hover desktop) | hover carte | année `scale 1.1` (origine droite) + couleur accent, point `scale 1.5` + fond accent, transitions 0,3 s (propriété `scale`, compose avec `translate`) |
| Année active (mobile) | scroll | fond accent + texte papier sur le lien de la nav (transition Tailwind 150 ms) |
| Compteurs de stats | apparition / choix d'un jour | 0 → valeur, 1 200 ms, décélération cubique (détails AGENT-SITE.md §5.2) |
| Scroll lissé | molette ≥ 640 px | Lenis `{ autoRaf, anchors }`, scrollTo `duration: 0.9` vers le cartouche |
| Hovers | liens/cartes | transitions Tailwind par défaut (150 ms) : bordures, couleurs, accent du mode **cible** pour les liens d'édition |

## 9. Grille, espacements, responsive

- Conteneur : `max-w-6xl mx-auto px-4 sm:px-6` partout (header, sections,
  footer). Cartouches de stats HP : `max-w-4xl`.
- Breakpoints actifs : `sm` 640 px (bascule mobile/desktop, échelle 90 %,
  Lenis), `min-[1400px]` (fil de timeline + année + point + voyageur en
  marge gauche : rail à `-3.25rem`, année à `-8.25rem`, largeur 16).
- Grille de carte HP desktop : `sm:grid-cols-[210px_1fr_210px]`
  (minimap / texte / photo carrée) ; sans photo `[230px_1fr]`.
- Rythme vertical : sections `mt-10 sm:mt-12` à `mt-14 sm:mt-16`,
  cartes espacées `space-y-8`, journal `space-y-7 sm:space-y-9`.
- Header : bordure basse 1 px navy, `bg-paper/80` + `backdrop-blur-sm`,
  sticky desktop seulement (`sm:sticky sm:top-0 sm:z-30`). Mobile : logo
  **centré optiquement sur le wordmark** (bloc décalé de −29 px = demi
  picto+gap ; le picto déborde à gauche).
- Footer : `bg-paper/80`, médaillon à cheval sur la bordure ondulée,
  contenu centré `pt-14 pb-10`, phrase (`text-sm ink-soft`) « Nos étés se
  suivent, à vélo puis à pied, toujours ensemble. » (sans cœur) puis crédit
  mono 10 px « 2021–2026 · Site par rndgf ».
- Mobile, décisions explicites : stats toujours en **grilles pleine largeur
  colonnes égales** (jamais d'inline ferré à gauche) ; 4 stats globales max
  (« jours dehors » masquée) ; boutons de jour compactés pour tenir sur
  **une ligne jusqu'à 8 boutons** à 375 px (px-1, pastilles 6 px, gaps 4 px)
  et centrés ; photo de couverture en pleine largeur `-mx-4 -mt-4`
  aspect 16/10.

## 10. Ce qu'un redesign peut toucher / doit conserver

**Conserver (fond)** : la règle sémantique des couleurs (§2), la séparation
donnée-mono / récit-serif, le privé (pas de photos au dépôt, noindex), les
comportements du §5 d'AGENT-SITE.md, l'accessibilité/reduced-motion, le
budget perf du §8, les données (§3 d'AGENT-SITE.md).

**Négociable (forme)** : les hex exacts, les fontes, le concept « atlas
gravé », les motifs du §5, les animations elles-mêmes — à condition de
re-spécifier un système aussi complet que celui-ci.

# Love Tours ❤

Site statique (Astro 7 + Tailwind 4 + MapLibre GL) qui retrace nos itinérances d'été
à deux : vélo une année, marche l'autre, depuis 2021.

## Commandes

```bash
npm run tours:all      # chaîne complète : import + géocodage + mini-cartes + fond de site
npm run tours:import   # importe editions/ → données du site, puis géocode les étapes
npm run dev            # serveur de développement (http://localhost:4321)
npm run build          # build statique dans dist/
```

`tours:import` refuse de supprimer quoi que ce soit si `editions/` est vide ; la purge
des sorties d'une édition supprimée demande l'option explicite `--prune` :
`node scripts/import-tours.mjs --prune`.

## Ajouter une édition

1. Créer un dossier `editions/<ANNÉE>_<Nom-Avec-Tirets>/` (ex. `editions/2025_GR34-Dinart-Erquy/`).
2. Y déposer **un fichier GPX par jour** (exports komoot/Strava). L'ordre vient des
   horodatages, pas des noms de fichiers. Les doublons (même heure de départ) sont ignorés.
   Les GPX à ne pas importer (fusions, exports) vont dans un sous-dossier, ex. `exports/`.
3. Optionnel — `edition.json` dans le dossier :

```json
{
  "title": "Zeeland Love Tour",
  "mode": "vélo",
  "flag": "🇳🇱",
  "country": "Pays-Bas",
  "description": "Une phrase d'accroche…",
  "tzOffsetHours": 2
}
```

   Sans ce fichier : titre = nom du dossier, mode déduit du `<type>` GPX
   (`*bike*`/`*bicycle*` → vélo, sinon à pied). Modes reconnus : `vélo`, `à pied`
   (`src/lib/mode.js`) — tout autre mode fait échouer l'import.

   **Numérotation des jours** : toutes les clés numériques d'`edition.json`
   (`statsOverrides`, `dayTitles`, `transfers.fromDay/toDay`) désignent le n° de
   jour **affiché sur le site**, c'est-à-dire après insertion des `extraDays` et
   tri chronologique (un prologue devient le jour 1).

   **Transferts** (`transfers`) : `from`/`to` acceptent `[lon, lat]` ou la valeur
   `"home"` (constante partagée, `scripts/lib/home.mjs`). Les liaisons routées
   passent par OSRM et sont mises en cache dans `data/transfers/` (clé = slug +
   coordonnées des extrémités : corriger un point recalcule le tracé).

   Chaque `edition.json` importé est recopié dans `data/editions/<slug>.json`
   (versionné) : `editions/` est hors dépôt, cette copie est la sauvegarde des
   métadonnées manuelles.

4. Photos — deux possibilités dans `editions/<édition>/photos/` :
   - **en vrac** : les JPEG sont rattachés au bon jour via leur date EXIF
     (`tzOffsetHours` sert à convertir l'heure locale EXIF vers l'UTC des GPX) ;
   - **pré-triées** : sous-dossiers `jour-1/`, `jour-2/`… copiés tels quels.

   Les photos sans jour identifiable partent dans `unsorted/` avec un avertissement.

5. `npm run tours:all` puis vérifier le rendu avec `npm run dev`.

Le géocodage des étapes (« De Vlissingen à Veere ») interroge Nominatim, avec
cache dans `data/geocode.json` et corrections dans `data/geocode-overrides.json`
(clé `"lat,lon"` à 3 décimales pour cibler une coordonnée, ou `"Toponyme"` pour
corriger un nom renvoyé par Nominatim ; les overrides inutilisés sont signalés
en fin d'exécution).

## Ce que produit l'import

| Sortie | Contenu |
|---|---|
| `src/data/tours/<slug>.json` | méta, stats par jour, bbox, modes de transfert, boucle par jour |
| `public/tours/<slug>.geojson` | 1 LineString par jour (trace simplifiée RDP 3 m) pour la carte |
| `src/assets/tours/<slug>/day-N/` | photos, optimisées au build par astro:assets |

Stats : D+/D- avec seuil 3 m (bruit capteur), temps en mouvement = vitesse ≥ 0,5 m/s.

## Carte

Fond vectoriel [OpenFreeMap](https://openfreemap.org) style *Positron* — gratuit, sans clé
API, sans quota. Une couleur par journée (`src/lib/palette.js`).

## Cartes en filigrane et mini-cartes

Les données [Natural Earth](https://www.naturalearthdata.com) (domaine public) sont dans
`data/naturalearth/` (hors dépôt — les scripts affichent comment les retélécharger si
absentes). Après ajout d'une édition (inclus dans `npm run tours:all`) :

```bash
npm run tours:minimaps     # mini-cartes des cartouches (homepage)
npm run tours:background   # fond de site (côtes + traces, centré maison)
```

## Déploiement

Le repo public ne contient **aucune photo** (`editions/` et `src/assets/tours/` sont
gitignorés ; les originaux vivent en local + sauvegarde personnelle). Le site est
construit localement puis poussé tel quel sur Cloudflare Pages :

```bash
npm run deploy
```

Premier déploiement : `npx wrangler login` puis créer le projet avec la commande
ci-dessus. Le site n'est pas indexé (robots.txt + meta noindex) : accessible
uniquement à qui a l'URL.

## Piège connu — dev server et images en 500

Après un `npm install` ou une modification de `package.json`/`astro.config.mjs`,
le redémarrage à chaud du serveur de dev perd le module sharp : toutes les images
`/_image` répondent 500 (« MissingSharp »). Le build de production n'est pas
affecté. Correctif : arrêter et relancer `npm run dev`.

## Ordre des photos

Par défaut, les photos d'une journée s'affichent dans l'ordre **chronologique de
prise de vue** (heure EXIF ; l'import préfixe les copies `001_`, `002_`…). La
première photo du jour devient la grande photo d'ouverture de la galerie.

Pour imposer un ordre manuel sur une journée : créer `photos/jour-N/` dans
l'édition et y déposer **toutes** les photos de ce jour — l'ordre alphabétique de
vos noms de fichiers fait foi (`01-depart.jpg`, `02-pause.jpg`…). Relancer
`npm run tours:import` après tout changement.

La photo de couverture d'une édition (homepage) se choisit dans `edition.json` :
`"cover": "fragment-du-nom-de-fichier"`.
# love-tours

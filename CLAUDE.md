# Règles projet Love Tours

## Documentation vivante — TOUJOURS

- **Toute modification du site doit être répercutée immédiatement** dans les
  documents concernés, sans que l'utilisateur ait à le demander :
  - `docs/AGENT-SITE.md` (but, contenu, données, comportements JS) ;
  - `docs/AGENT-DESIGN-DNA.md` (palette, typo, motifs, animations, layout) ;
  - `README.md` (pipeline, commandes, pièges, contraintes techniques).
- Vérifier à chaque changement si l'un des trois est impacté ; le mettre à
  jour dans le même lot de travail (même commit).

## Nommage — TOUJOURS

- **Identifiants 100 % anglais**, sans exception : noms de fichiers,
  composants, variables, fonctions, classes CSS, IDs, attributs `data-*`.
  Seule exception : les fichiers de `src/pages/` dont le nom devient une
  URL visible (ex. `a-propos.astro`) — l'URL est un texte utilisateur,
  donc en français.
- Le **français** est réservé aux commentaires, aux textes visibles par
  l'utilisateur et aux données (`mode: "vélo"`, toponymes…).
- **Aucun franglais** : jamais d'identifiant mêlant les deux langues
  (ex. interdit : `StatsCartouche`, `pictosList`, `cartoucheStats`).

## Déploiement

- **Le déploiement ne se fait jamais silencieusement.** Avant chaque `npm run deploy` (ou `wrangler pages deploy`), annoncer explicitement l'intention de déployer et attendre l'accord de l'utilisateur, sauf si celui-ci vient de le demander dans son dernier message.
- Ne déployer que lorsque le travail en cours est terminé et validé — pas à chaque modification.

## Rappels techniques

- Tout `npm install` (y compris implicite via `npx` qui installe un paquet) invalide le cache Vite du dev server → redémarrer le serveur de dev ensuite.
- `npm run tours:import` enchaîne automatiquement le géocodage des étapes ; `npm run tours:all` fait tout (import + geocode + minimaps + background). Cache réseau dans `data/geocode.json`, corrections manuelles dans `data/geocode-overrides.json` (clé « lat,lon » ou toponyme).
- La purge des sorties d'une édition supprimée exige `node scripts/import-tours.mjs --prune` (jamais implicite).
- Les photos personnelles (`editions/`, `src/assets/tours/`) ne vont jamais dans le dépôt public.

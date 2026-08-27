# Règles projet Love Tours

## Déploiement

- **Le déploiement ne se fait jamais silencieusement.** Avant chaque `npm run deploy` (ou `wrangler pages deploy`), annoncer explicitement l'intention de déployer et attendre l'accord de l'utilisateur, sauf si celui-ci vient de le demander dans son dernier message.
- Ne déployer que lorsque le travail en cours est terminé et validé — pas à chaque modification.

## Rappels techniques

- Tout `npm install` (y compris implicite via `npx` qui installe un paquet) invalide le cache Vite du dev server → redémarrer le serveur de dev ensuite.
- `npm run tours:import` enchaîne automatiquement le géocodage des étapes ; `npm run tours:all` fait tout (import + geocode + minimaps + background). Cache réseau dans `data/geocode.json`, corrections manuelles dans `data/geocode-overrides.json` (clé « lat,lon » ou toponyme).
- La purge des sorties d'une édition supprimée exige `node scripts/import-tours.mjs --prune` (jamais implicite).
- Les photos personnelles (`editions/`, `src/assets/tours/`) ne vont jamais dans le dépôt public.

# Règles projet Love Tours

## Déploiement

- **Le déploiement ne se fait jamais silencieusement.** Avant chaque `npm run deploy` (ou `wrangler pages deploy`), annoncer explicitement l'intention de déployer et attendre l'accord de l'utilisateur, sauf si celui-ci vient de le demander dans son dernier message.
- Ne déployer que lorsque le travail en cours est terminé et validé — pas à chaque modification.

## Rappels techniques

- Tout `npm install` (y compris implicite via `npx` qui installe un paquet) invalide le cache Vite du dev server → redémarrer le serveur de dev ensuite.
- Après `npm run tours:import`, relancer `npm run tours:geocode` (toponymes des étapes) — cache réseau dans `data/geocode.json`, corrections manuelles dans `data/geocode-overrides.json`.
- Les photos personnelles (`editions/`, `src/assets/tours/`) ne vont jamais dans le dépôt public.

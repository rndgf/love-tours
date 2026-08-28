---
name: ship
description: Commit + push + déploiement Cloudflare Pages en une commande
---

Livre le travail en cours : commit, push, déploiement. L'invocation de cette
commande vaut accord explicite de déploiement (règle CLAUDE.md respectée).

Étapes, dans l'ordre — s'arrêter et le signaler si l'une échoue :

1. `git status` puis `git diff` (aperçu) pour comprendre ce qui part.
   S'il n'y a **aucun changement**, le dire et s'arrêter (ne pas déployer pour rien).
2. `git add -A`.
3. Commit avec un message en français, style du projet (voir `git log`) :
   titre = action + objet, corps en puces factuelles si plusieurs sujets.
   Terminer le message par :
   `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
4. `git push`.
5. `npm run deploy` (build + wrangler pages deploy).
6. Vérification rapide en prod : `curl -s https://love-tours.fr/` doit répondre
   HTTP 200 et contenir un marqueur du changement livré quand c'est vérifiable.
7. Résumé : hash du commit, fichiers, URL de déploiement.

Rappels :
- Ne jamais committer `editions/`, `src/assets/tours/`, `data/naturalearth/`
  (gitignorés — vérifier qu'ils n'apparaissent pas dans `git status`).
- Si `npx` installe wrangler au passage, redémarrer le serveur de dev ensuite
  (cache Vite invalidé — piège documenté dans CLAUDE.md).

$ARGUMENTS

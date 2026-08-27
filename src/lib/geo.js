/** Distance approchée en mètres entre deux points [lon, lat] (équirectangulaire locale). */
export const distM = ([lon1, lat1], [lon2, lat2]) =>
  Math.hypot((lon2 - lon1) * 111320 * Math.cos((lat1 * Math.PI) / 180), (lat2 - lat1) * 111320);

/**
 * Sous ce seuil, deux extrémités comptent pour le même lieu : détection de
 * boucle (départ ≈ arrivée) et fusion des points d'étape entre deux jours.
 * Seuil unique, partagé entre l'import, les mini-cartes et la carte détail.
 */
export const LOOP_MAX_M = 500;

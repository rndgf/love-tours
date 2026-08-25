/** Accès aux photos importées (src/assets/tours/<slug>/day-N/), optimisées par astro:assets. */
const modules = import.meta.glob("../assets/tours/*/day-*/*.{jpg,jpeg,png,webp,avif,JPG,JPEG}", { eager: true });

const entries = Object.entries(modules)
  .map(([path, m]) => ({ path, image: m.default }))
  .sort((a, b) => a.path.localeCompare(b.path));

export function photosFor(slug, day) {
  return entries.filter((e) => e.path.includes(`/tours/${slug}/day-${day}/`)).map((e) => e.image);
}

/**
 * Photo de couverture d'une édition : correspondance avec edition.json → cover
 * (fragment de nom de fichier), sinon première photo du premier jour illustré.
 */
export function coverFor(tour) {
  const all = entries.filter((e) => e.path.includes(`/tours/${tour.slug}/day-`));
  if (!all.length) return null;
  if (tour.cover) {
    const hit = all.find((e) => e.path.includes(tour.cover));
    if (hit) return hit.image;
  }
  return all[0].image;
}

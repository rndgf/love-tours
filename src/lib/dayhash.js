/**
 * Hash d'URL « #jN » : journée sélectionnée sur une page détail.
 * Parseur unique, partagé entre la carte (zoom) et le cartouche de stats.
 */
export const parseDayHash = (hash) => {
  const m = /^#j(\d+)$/i.exec(hash);
  return m ? +m[1] : null;
};

export const dayHash = (n) => `#j${n}`;

/** Couleur de trace pour chaque journée (palette chaude, esprit livre photo). */
export const DAY_COLORS = [
  "#cf3f56", // rose profond
  "#e07a3f", // terracotta
  "#c9a227", // ocre doré
  "#4f9d69", // vert amande
  "#3f7fb5", // bleu mer
  "#7f5ba6", // mauve
  "#d15f8e", // rose clair
  "#3aa6a6", // sarcelle
  "#8a5a44", // brun cacao
  "#7a8a3a", // olive
  "#a63d6f", // framboise
  "#46628f", // bleu ardoise
];
export const dayColor = (n) => {
  if (n > DAY_COLORS.length) {
    console.warn(`dayColor : jour ${n} > ${DAY_COLORS.length} couleurs, réutilisation cyclique`);
  }
  return DAY_COLORS[(n - 1) % DAY_COLORS.length];
};

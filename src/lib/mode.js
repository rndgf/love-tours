/**
 * Mode de déplacement d'une édition — source unique de vérité.
 * Toute la discrimination mode → accent (carmin vélo, sapin à pied) passe ici :
 * un mode inconnu lève une erreur au build plutôt que de retomber en silence
 * sur la mauvaise couleur.
 */
export const MODES = ["vélo", "à pied"];

function accent(mode) {
  if (mode === "vélo") return "carmin";
  if (mode === "à pied") return "sapin";
  throw new Error(`mode inconnu : "${mode}" (attendus : ${MODES.join(", ")})`);
}

// Chaînes complètes en clair : Tailwind ne conserve que les classes écrites littéralement.
export const accentText = (mode) => (accent(mode) === "carmin" ? "text-carmin" : "text-sapin");
export const accentHover = (mode) => (accent(mode) === "carmin" ? "hover:text-carmin" : "hover:text-sapin");
export const accentVar = (mode) => (accent(mode) === "carmin" ? "var(--color-carmin)" : "var(--color-sapin)");
export const isBike = (mode) => accent(mode) === "carmin";

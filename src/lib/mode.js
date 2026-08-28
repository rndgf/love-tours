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

/**
 * Picto « en mouvement » selon le mode : cycliste ou randonneur.
 * Tracés Font Awesome Free 6 (person-biking / person-hiking, licence CC BY 4.0),
 * rendus en aplat (`extra: "fa"`) — plus lisibles que le trait fin à 14 px.
 */
export const moveIcon = (mode) =>
  isBike(mode)
    ? {
        viewBox: "0 0 640 512",
        extra: "fa",
        d: "M400 96a48 48 0 1 0 0-96 48 48 0 1 0 0 96zm27.2 64l-61.8-48.8c-17.3-13.6-41.7-13.8-59.1-.3l-83.1 64.2c-30.7 23.8-28.5 70.8 4.3 91.6L288 305.1 288 416c0 17.7 14.3 32 32 32s32-14.3 32-32l0-128c0-10.7-5.3-20.7-14.2-26.6L295 232.9l60.3-48.5L396 217c5.7 4.5 12.7 7 20 7l64 0c17.7 0 32-14.3 32-32s-14.3-32-32-32l-52.8 0zM56 384a72 72 0 1 1 144 0A72 72 0 1 1 56 384zm200 0A128 128 0 1 0 0 384a128 128 0 1 0 256 0zm184 0a72 72 0 1 1 144 0 72 72 0 1 1 -144 0zm200 0a128 128 0 1 0 -256 0 128 128 0 1 0 256 0z",
      }
    : {
        viewBox: "0 0 384 512",
        extra: "fa",
        d: "M192 48a48 48 0 1 1 96 0 48 48 0 1 1 -96 0zm51.3 182.7L224.2 307l49.7 49.7c9 9 14.1 21.2 14.1 33.9l0 89.4c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-82.7-73.9-73.9c-15.8-15.8-22.2-38.6-16.9-60.3l20.4-84c8.3-34.1 42.7-54.9 76.7-46.4c19 4.8 35.6 16.4 46.4 32.7L305.1 208l30.9 0 0-24c0-13.3 10.7-24 24-24s24 10.7 24 24l0 55.8c0 .1 0 .2 0 .2s0 .2 0 .2L384 488c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-216-39.4 0c-16 0-31-8-39.9-21.4l-13.3-20zM81.1 471.9L117.3 334c3 4.2 6.4 8.2 10.1 11.9l41.9 41.9L142.9 488.1c-4.5 17.1-22 27.3-39.1 22.8s-27.3-22-22.8-39.1zm55.5-346L101.4 266.5c-3 12.1-14.9 19.9-27.2 17.9l-47.9-8c-14-2.3-22.9-16.3-19.2-30L31.9 155c9.5-34.8 41.1-59 77.2-59l4.2 0c15.6 0 27.1 14.7 23.3 29.8z",
      };

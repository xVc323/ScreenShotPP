// Maths pures du trim : bornage des poignées et durée effective.
// Aucune dépendance au DOM ; testé par trim.test.js.
export const MIN_GAP = 0.1; // secondes

/** Borne start/end au [0, duration] en garantissant un écart minimal. */
export function clampTrim(start, end, duration) {
  let s = Math.max(0, Math.min(start, duration));
  let e = Math.max(0, Math.min(end, duration));
  if (e < s + MIN_GAP) {
    // Chevauchement : la plus petite valeur devient le début, la fin est
    // repoussée d'un écart minimal (et rabattue si on bute sur la durée).
    s = Math.min(s, e);
    e = Math.min(duration, s + MIN_GAP);
    if (e < s + MIN_GAP) s = Math.max(0, e - MIN_GAP);
  }
  return { start: s, end: e };
}

/** Durée effective après application de la vitesse de lecture. */
export function effectiveDuration(start, end, speed) {
  return (end - start) / speed;
}

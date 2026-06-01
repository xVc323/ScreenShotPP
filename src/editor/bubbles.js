/** Rang 1-based de la bulle à `index` parmi toutes les bulles, ou null si pas une bulle. */
export function bubbleNumberAt(annotations, index) {
  if (annotations[index]?.type !== "bubble") return null;
  let n = 0;
  for (let i = 0; i <= index; i += 1) if (annotations[i].type === "bubble") n += 1;
  return n;
}

/**
 * Extrémité du trait reliant le cartouche (à l'offset dx,dy depuis le centre de la
 * bulle) au bord du cercle de rayon `radius` — pour que le trait ne déborde pas sur
 * la bulle. Renvoie [x, y] dans le repère local de la bulle (centre = 0,0). Si
 * l'offset est nul (cartouche sur la bulle), renvoie [0, 0].
 */
export function bubbleConnectorEnd(dx, dy, radius) {
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return [0, 0];
  return [(dx / distance) * radius, (dy / distance) * radius];
}

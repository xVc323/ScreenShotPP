/** Rang 1-based de la bulle à `index` parmi toutes les bulles, ou null si pas une bulle. */
export function bubbleNumberAt(annotations, index) {
  if (annotations[index]?.type !== "bubble") return null;
  let n = 0;
  for (let i = 0; i <= index; i += 1) if (annotations[i].type === "bubble") n += 1;
  return n;
}

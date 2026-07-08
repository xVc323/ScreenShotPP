// Maths pures du crop : bornage au cadre vidéo et conversion affichage→pixels.
// Aucune dépendance au DOM ; testé par crop.test.js.

/** Borne un rect au cadre vidéo et arrondit à l'entier (plancher). */
export function clampCrop(rect, videoW, videoH) {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  return {
    x,
    y,
    width: Math.min(Math.floor(rect.width), videoW - x),
    height: Math.min(Math.floor(rect.height), videoH - y),
  };
}

/** Convertit un rect exprimé dans l'espace d'affichage du <video> en pixels vidéo. */
export function displayToVideo(rect, dispW, dispH, videoW, videoH) {
  const fx = videoW / dispW;
  const fy = videoH / dispH;
  return clampCrop(
    {
      x: rect.x * fx,
      y: rect.y * fy,
      width: rect.width * fx,
      height: rect.height * fy,
    },
    videoW,
    videoH
  );
}

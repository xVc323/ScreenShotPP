/** Recadrage source (pixels de la capture) d'une mosaïque, en fonction de l'échelle. */
export function mosaicCrop(descriptor, scale) {
  return {
    x: Math.round(descriptor.cropX),
    y: Math.round(descriptor.cropY),
    width: Math.round(descriptor.width * scale),
    height: Math.round(descriptor.height * scale),
  };
}

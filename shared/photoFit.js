// Fit the complete image into a rectangular export slot without cropping.
// Shared pure geometry so the export can be regression-tested without a DOM.
export function fitPhotoBox(imageWidth, imageHeight, x, y, width, height) {
  const values = [imageWidth, imageHeight, x, y, width, height];
  if (values.some(value => !Number.isFinite(value)) ||
      imageWidth <= 0 || imageHeight <= 0 || width <= 0 || height <= 0) return null;
  const scale = Math.min(width / imageWidth, height / imageHeight);
  const fittedWidth = imageWidth * scale, fittedHeight = imageHeight * scale;
  return {
    x: x + (width - fittedWidth) / 2,
    y: y + (height - fittedHeight) / 2,
    width: fittedWidth,
    height: fittedHeight,
  };
}

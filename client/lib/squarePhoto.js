// One crop model for the iPhone preview and the JPEG uploaded to R2.
// Coordinates are normalized in the movable area of the original image.
export const PHOTO_OUTPUT_SIZE = 768;

export function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

export function squareCrop(width, height, zoom = 1, position = { x: 0.5, y: 0.5 }) {
  if (!(width > 0 && height > 0)) throw new Error('A foto não tem dimensões válidas.');
  const scale = clamp(Number(zoom), 1, 3);
  const side = Math.min(width, height) / scale;
  return {
    x: (width - side) * clamp(Number(position?.x), 0, 1),
    y: (height - side) * clamp(Number(position?.y), 0, 1),
    side,
  };
}

export function dragSquareCrop(width, height, zoom, position, dx, dy, viewportSize) {
  const crop = squareCrop(width, height, zoom, position);
  const size = Math.max(1, viewportSize);
  const move = (current, pixels, axisLength) => {
    const movable = axisLength - crop.side;
    if (movable < 0.01) return 0.5;
    return clamp(current - (pixels / size) * crop.side / movable);
  };
  return {
    x: move(clamp(position.x), dx, width),
    y: move(clamp(position.y), dy, height),
  };
}

export function drawSquarePhoto(image, canvas, zoom, position) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const { x, y, side } = squareCrop(width, height, zoom, position);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('O navegador não conseguiu preparar o recorte.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, x, y, side, side, 0, 0, canvas.width, canvas.height);
  return { x, y, side };
}

export async function exportSquarePhoto(image, zoom, position, size = PHOTO_OUTPUT_SIZE) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  drawSquarePhoto(image, canvas, zoom, position);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error('Não foi possível salvar o recorte.')),
      'image/jpeg',
      0.88,
    );
  });
  if (blob.type !== 'image/jpeg') throw new Error('O navegador não gerou um JPEG válido.');
  return blob;
}

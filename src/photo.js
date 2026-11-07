// Only the 1:1 recipient portrait endpoint uses this constraint.
// Letter photos keep their original aspect ratio.
export function jpegDimensions(bytes) {
  if (!bytes || bytes.length < 12 ||
      bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let index = 2;
  const sof = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
  while (index + 3 < bytes.length) {
    if (bytes[index] !== 0xff) return null;
    while (bytes[index] === 0xff) index++;
    if (index >= bytes.length) return null;
    const marker = bytes[index++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (index + 1 >= bytes.length) return null;
    const length = (bytes[index] << 8) | bytes[index + 1];
    if (length < 2 || index + length > bytes.length) return null;
    if (sof.has(marker)) {
      if (length < 7) return null;
      const height = (bytes[index + 3] << 8) | bytes[index + 4];
      const width = (bytes[index + 5] << 8) | bytes[index + 6];
      return width && height ? { width, height } : null;
    }
    index += length;
  }
  return null;
}

export function isSquareRecipientJpeg(bytes) {
  const dimensions = jpegDimensions(bytes);
  return !!dimensions && dimensions.width === dimensions.height &&
    dimensions.width >= 240 && dimensions.width <= 2048;
}

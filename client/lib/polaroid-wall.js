// Shuffle only consented, published photos; leave the original recipients list untouched.
export function shuffledPolaroidPhotos(recipients, random = Math.random) {
  const photos = (recipients || []).filter(
    (person) => person && person.active !== 0 && person.slug && person.photo_url,
  );

  // Fisher-Yates: a new random order on each page load, stable during re-renders.
  for (let i = photos.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [photos[i], photos[j]] = [photos[j], photos[i]];
  }

  return photos.map((person) => ({
    person,
    rotation: (random() * 8 - 4).toFixed(1) + 'deg',
    shift: Math.round(random() * 12 - 6) + 'px',
  }));
}

import React, { useEffect, useState } from 'react';
import { STICKERS_BY_ID } from '../../../shared/letter.js';

// Each sticker is now an authored graphic asset, not an icon + HTML text widget.
export function Sticker({ presetId, small = false }) {
  const preset = STICKERS_BY_ID[presetId];
  const [useFallback, setUseFallback] = useState(false);
  useEffect(() => setUseFallback(false), [presetId]);
  if (!preset) return null;
  return (
    <span className={`ejc-sticker-image${small ? ' ejc-sticker-image--small' : ''}`}>
      <img
        src={useFallback ? `/stickers/${encodeURIComponent(preset.id)}.svg` : `/api/stickers/${encodeURIComponent(preset.id)}.webp`}
        onError={() => setUseFallback(true)}
        alt={preset.text}
        loading="lazy" draggable={false} />
    </span>
  );
}

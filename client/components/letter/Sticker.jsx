import React, { useEffect, useState } from 'react';
import { STICKERS_BY_ID } from '../../../shared/letter.js';

// Same lossless PNG for picker, on-letter preview and exported image.
export function Sticker({ presetId, small = false }) {
  const preset = STICKERS_BY_ID[presetId];
  const [missing, setMissing] = useState(false);
  useEffect(() => setMissing(false), [presetId]);
  if (!preset) return null;
  return (
    <span className={'ejc-sticker-image' + (small ? ' ejc-sticker-image--small' : '')}>
      {missing
        ? <span className="ejc-sticker-not-ready" title="Aguardando envio da arte PNG original">
            <span aria-hidden="true">✳</span>{preset.text}
          </span>
        : <img src={'/api/stickers/' + encodeURIComponent(preset.id) + '.png'}
            onError={() => setMissing(true)} alt={preset.text}
            loading="lazy" draggable={false} />}
    </span>
  );
}

import React from 'react';
import { STICKERS_BY_ID, STICKER_COLORS } from '../../../shared/letter.js';

// Original line artwork made of SVG paths. No external images or copyrighted icons.
export function StickerGlyph({ name }) {
  const shared = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const shapes = {
    cross: <><path d="M18 4v26M7 15h22" /></>,
    heart: <path d="M18 31 5 18C-2 8 8-1 18 10 28-1 38 8 31 18Z" />,
    sparkle: <><path d="M18 1 23 13 35 18 23 23 18 35 13 23 1 18 13 13Z" /><path d="m29 3 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" /></>,
    star: <path d="m18 3 4 11 11 4-11 4-4 11-4-11-11-4 11-4Z" />,
    stars: <><path d="m14 2 4 10 10 4-10 4-4 10-4-10-10-4 10-4Z" /><path d="m29 21 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" /></>,
    flower: <><path d="M18 10c-7-14-15-1-8 6-15-6-13 9-2 9-2 14 12 12 12 3 11 9 17-6 7-9 10-11-5-17-9-9Z" /><circle cx="18" cy="19" r="4" /></>,
    branch: <><path d="M6 31 30 7"/><path d="M14 23Q5 10 4 14q0 8 10 9ZM21 16q-2-12 8-13 1 10-8 13ZM23 14q12-3 13 7-10 1-13-7ZM11 26Q3 22 2 29q5 6 9-3Z" /></>,
    arrow: <><path d="M2 18h30m-9-10 9 10-9 10" /><path d="M9 8c2-4 6-4 9 0" /></>,
    sun: <><circle cx="18" cy="18" r="7" /><path d="M18 1v7m0 20v7M1 18h7m20 0h7M6 6l5 5m14 14 5 5M30 6l-5 5M11 25l-5 5" /></>,
    marian: <><path d="M9 30q0-18 9-27 9 9 9 27" /><path d="m11 26 7-9 7 9m-7-9v12M6 33q12-5 24 0" /><circle cx="18" cy="9" r="2" /></>,
    halo: <><ellipse cx="18" cy="8" rx="12" ry="4" /><path d="M18 13v19M10 21l8 11 8-11" /></>,
    'sacred-heart': <><path d="M18 33 6 20C-3 8 10-1 18 12 26-1 39 8 30 20Z"/><path d="M18 13V3M13 8h10m-10 14h10m-5-5v10"/></>,
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 36 36" width="29" height="29" {...shared}>
      {shapes[name] || shapes.sparkle}
    </svg>
  );
}

export function Sticker({ presetId, color, small = false }) {
  const preset = STICKERS_BY_ID[presetId];
  if (!preset) return null;
  const tone = STICKER_COLORS[preset.colors.includes(color) ? color : preset.colors[0]];
  return (
    <span
      className={`ejc-sticker ejc-sticker--${preset.shape}${small ? ' ejc-sticker--small' : ''}`}
      style={{ '--sticker-bg': tone.bg, '--sticker-ink': tone.ink, '--sticker-edge': tone.edge }}
    >
      <span className="ejc-sticker__content">
        <StickerGlyph name={preset.icon} />
        <span className="ejc-sticker__words">{preset.text}</span>
        {preset.reference && <span className="ejc-sticker__verse">{preset.reference}</span>}
      </span>
    </span>
  );
}

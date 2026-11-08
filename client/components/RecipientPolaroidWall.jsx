import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Heart, Sparkles } from 'lucide-react';
import { track } from '../lib/api';
import { shuffledPolaroidPhotos } from '../lib/polaroid-wall';
import '../styles/recipient-polaroids.css';

export default function RecipientPolaroidWall({ recipients }) {
  const photos = useMemo(() => shuffledPolaroidPhotos(recipients), [recipients]);

  // Keep the searchable list below usable even before any photos are uploaded.
  if (!photos.length) return null;

  return (
    <section className="ejc-polaroid-wall" aria-labelledby="ejc-polaroid-title">
      <div className="ejc-polaroid-heading">
        <span className="ejc-polaroid-kicker"><Sparkles size={16} /> MURAL DE ENCONTRISTAS</span>
        <h2 id="ejc-polaroid-title">Cada rosto, uma história. 💌</h2>
        <p>Toque em uma foto para escrever uma cartinha cheia de carinho.</p>
      </div>
      <div className="ejc-polaroid-grid">
        {photos.map(({ person, rotation, shift }, index) => (
          <Link
            className="ejc-polaroid-card"
            key={person.id || person.slug}
            to={'/enviar/' + person.slug}
            aria-label={'Enviar uma cartinha para ' + person.name}
            style={{ '--polaroid-rotation': rotation, '--polaroid-shift': shift }}
            onClick={() => track('recipient_selected')}
          >
            <span className="ejc-polaroid-image">
              <img
                src={person.photo_url}
                alt={'Foto de ' + person.name}
                loading={index < 4 ? 'eager' : 'lazy'}
                decoding="async"
              />
            </span>
            <span className="ejc-polaroid-caption">
              <strong>{person.name}</strong>
              <span className="ejc-polaroid-action">
                <Heart size={13} aria-hidden="true" /> Escrever <ArrowUpRight size={13} aria-hidden="true" />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

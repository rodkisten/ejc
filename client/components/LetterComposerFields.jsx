import React, { useState } from 'react';
import { ImagePlus, LockKeyhole, Trash2 } from 'lucide-react';
import RichEditor from './RichEditor';
import Recorder from './Recorder';
import VoicePlayer from './VoicePlayer';
import LetterControls from './letter/LetterControls';
import LetterMediaLightbox from './letter/LetterMediaLightbox';
import '../styles/letter-composer-shared.css';

/**
 * The same composer is used for a new cartinha and for a previously paid draft.
 * Only the surrounding payment/navigation and submission buttons change.
 * Existing media stays on the private order; newly attached files remain local
 * until the user explicitly saves.
 */
export default function LetterComposerFields({
  sender,
  onSenderChange,
  html,
  onHtmlChange,
  composition,
  onCompositionChange,
  assets = [],
  onAddAsset,
  onRemoveAsset,
  existingMedia = [],
  onRemoveExistingMedia,
  disabled = false,
  readReceiptSlot = null,
  showPrivacyNotice = true,
}) {
  const photos = assets.filter(asset => asset.kind === 'image');
  const audios = assets.filter(asset => asset.kind === 'audio');
  const existingPhotos = existingMedia.filter(asset => asset.kind === 'image');
  const existingAudios = existingMedia.filter(asset => asset.kind === 'audio');
  const [openPhoto, setOpenPhoto] = useState(null);
  const allPhotos = [
    ...existingPhotos.map(asset => ({ ...asset, filename: asset.filename || 'Foto enviada' })),
    ...photos.map(asset => ({ ...asset, filename: asset.file?.name || 'Foto da cartinha' })),
  ];

  return (
    <>
      <section className="form-card">
        <label htmlFor="sender">Quem assina esta cartinha? <span className="muted">(opcional)</span></label>
        <input id="sender" autoComplete="name" value={sender} disabled={disabled}
          onChange={event => {
            onSenderChange(event.target.value.slice(0, 100));
            onCompositionChange(previous => ({ ...previous, authorName: '' }));
          }}
          placeholder="Seu nome, sua família, seus amigos..." />
        <p className="muted small">O remetente é independente em cada cartinha. Você pode alterá-lo sem gerar outro Pix.</p>
      </section>

      <section className="form-card">
        <h2>01. Suas palavras ✍️</h2>
        <RichEditor value={html} onChange={onHtmlChange} disabled={disabled} />
      </section>

      <section className="form-card">
        <h2>02. Sua voz 🎙️</h2>
        <p className="muted small">Grave e regrave, quantas vezes precisar.</p>
        {!disabled && <Recorder onAdd={file => onAddAsset(file, 'audio')} />}
        {(existingAudios.length > 0 || audios.length > 0) && <div className="asset-list">
          {existingAudios.map(asset => <div className="asset-row" key={asset.id}>
            <VoicePlayer src={asset.url} title={asset.filename} compact />
            {!disabled && <button className="icon-button danger" type="button"
              aria-label="Remover áudio" onClick={() => onRemoveExistingMedia?.(asset)}>
              <Trash2 size={17} />
            </button>}
          </div>)}
          {audios.map(asset => <div className="asset-row" key={asset.url}>
            <VoicePlayer src={asset.url} title={asset.file.name} compact />
            {!disabled && <button className="icon-button danger" type="button"
              aria-label="Remover áudio" onClick={() => onRemoveAsset(asset)}>
              <Trash2 size={17} />
            </button>}
          </div>)}
        </div>}
      </section>

      <section className="form-card">
        <h2>03. Suas fotos 📸</h2>
        {!disabled && <label className="upload-label">
          <ImagePlus size={20} /> Adicionar fotos
          <input type="file" multiple accept="image/*,.heic,.heif"
            onChange={event => {
              [...event.target.files].forEach(file => onAddAsset(file, 'image'));
              event.target.value = '';
            }} />
        </label>}
        {allPhotos.length > 0 && (
          <>
            <p className="muted small">Fotos sem cortes. Toque para ampliar, baixar ou compartilhar.</p>
            <div className="photos-grid">
              {allPhotos.map((asset, index) => (
                <div className="photo-item" key={asset.id || asset.url}>
                  <button type="button" className="photo-item__open"
                    aria-label={'Ampliar foto ' + (index + 1)}
                    onClick={() => setOpenPhoto(index)}>
                    <img src={asset.url} alt={'Foto ' + (index + 1) + ' da cartinha'} loading="lazy" />
                  </button>
                  {!disabled && (
                    <button type="button" className="photo-item__remove" aria-label="Excluir foto"
                      onClick={() => index < existingPhotos.length
                        ? onRemoveExistingMedia?.(asset) : onRemoveAsset(asset)}>
                      <Trash2 size={17} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <fieldset disabled={disabled} className="ejc-composer-controls-fieldset">
        <LetterControls composition={composition} onChange={onCompositionChange} senderName={sender} />
      </fieldset>

      {openPhoto !== null && allPhotos.length > 0 && (
        <LetterMediaLightbox images={allPhotos} initialIndex={openPhoto}
          onClose={() => setOpenPhoto(null)} />
      )}

      {readReceiptSlot}

      {showPrivacyNotice && <div className="notice">
        <LockKeyhole size={18} />
        <span>Apenas quem tem o código pessoal do mural poderá ler. A coordenação pode ver o nome do remetente e os stickers, mas nunca o texto, fotos ou áudios.</span>
      </div>}
    </>
  );
}

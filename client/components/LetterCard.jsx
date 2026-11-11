import React, { useState } from 'react';
import { zipSync, strToU8 } from 'fflate';
import { Download, FileArchive, Music2, Share2 } from 'lucide-react';
import VoicePlayer from './VoicePlayer';
import LetterCanvas from './letter/LetterCanvas';
import InstagramExportPanel from './social/InstagramExportPanel';
import { plainLetter } from '../../shared/letter.js';
import { renderLetterImages, letterFileName } from '../lib/letterExport.js';
import { download, share } from '../lib/api.js';

export const safeFilename = (value) => String(value || 'cartinha')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9_-]+/gi, '-').slice(0, 50);

export function LetterCard({ letter, recipient, actions = true, editable = false, onCompositionChange }) {
  const audios = (letter.media || []).filter((media) => media.kind === 'audio');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  async function runExport(mode) {
    setBusy(mode);
    setError('');
    try {
      await exportLetter(letter, recipient, mode);
    } catch (cause) {
      if (cause?.name !== 'AbortError') setError(cause?.message || 'Falha ao exportar a cartinha.');
    } finally {
      setBusy('');
    }
  }
  return (
    <article className="letter-card">
      <LetterCanvas letter={letter} recipient={recipient} editable={editable}
        onCompositionChange={onCompositionChange} />
      {!!audios.length && (
        <div className="letter-voice">
          <span className="eyebrow">Ouça as mensagens guardadas ♡</span>
          {audios.map((media, index) => (
            <VoicePlayer key={media.id || index} src={media.url}
              title={`Mensagem de voz ${index + 1}`} compact />
          ))}
        </div>
      )}
      {actions && (
        <>
          <div className="letter-actions">
            <button type="button" className="btn ghost"
              disabled={!!busy} onClick={() => runExport('png')}>
              <Download size={16} /> Cartinha completa
            </button>
            <button type="button" className="btn"
              disabled={!!busy} onClick={() => runExport('share')}>
              <Share2 size={16} /> WhatsApp / Compartilhar
            </button>
            <button type="button" className="btn outline"
              disabled={!!busy} onClick={() => runExport('zip')}>
              <FileArchive size={16} /> ZIP com anexos
            </button>
          </div>
          <p className="muted small">No iPhone, selecione WhatsApp ou outro aplicativo na folha de compartilhamento. O link privado do mural não é compartilhado.</p>
          {busy && <p className="muted small" role="status">Preparando sua cartinha...</p>}
          {error && <p className="notice error" role="alert">{error}</p>}
          <InstagramExportPanel letter={letter} recipient={recipient} />
        </>
      )}
    </article>
  );
}

async function toBytes(url) {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Não foi possível baixar um anexo.');
  return new Uint8Array(await response.arrayBuffer());
}

async function zipLetter(letter, recipient, pages) {
  const label = safeFilename(recipient || letter.recipient_name);
  const files = {};
  let total = 0;
  for (let index = 0; index < pages.length; index++) {
    const bytes = new Uint8Array(await pages[index].arrayBuffer());
    total += bytes.byteLength;
    files[letterFileName(label, 'letter', pages.length > 1 ? index : 0)] = bytes;
  }
  files['mensagem.txt'] = strToU8(plainLetter(letter.rich_html));
  for (const [index, media] of (letter.media || []).entries()) {
    const bytes = await toBytes(media.url);
    total += bytes.byteLength;
    if (total > 200 * 1024 * 1024) {
      throw new Error('O arquivo excede 200 MB neste navegador. Baixe as fotos e áudios separadamente.');
    }
    const folder = media.kind === 'audio' ? 'audios' : 'fotos';
    files[`${folder}/${index + 1}-${safeFilename(media.filename)}`] = bytes;
  }
  return zipSync(files, { level: 0 });
}

export async function exportLetter(letter, recipient, mode = 'png') {
  const who = recipient || letter.recipient_name;
  const pages = await renderLetterImages(letter, who, 'letter');
  if (!pages.length) throw new Error('Não foi possível gerar a cartinha.');
  if (mode === 'png' && pages.length === 1) {
    download(pages[0], letterFileName(who, 'letter'), 'image/png');
    return;
  }
  if (mode === 'share') {
    const files = pages.map((blob, index) => new File([blob],
      letterFileName(who, 'letter', pages.length > 1 ? index : 0), { type: 'image/png' }));
    if (navigator.share && navigator.canShare?.({ files })) {
      await navigator.share({
        files, title: `Cartinha para ${who}`, text: 'Um carinho especial do XX EJC 💜',
      });
      return;
    }
    if (files.length === 1) {
      await share(files[0], `Cartinha para ${who}`, 'Um carinho do XX EJC 💜');
      return;
    }
  }
  const zip = await zipLetter(mode === 'png' ? { ...letter, media: [] } : letter, who, pages);
  download(zip, `homenagem-${safeFilename(who)}.zip`, 'application/zip');
}

export function saveAllCards(letters, recipient) {
  return Promise.all(letters.map((letter) => exportLetter(letter, recipient, 'zip')));
}

export function MediaDownload({ media }) {
  return (
    <div className="media-download">
      <a href={media.url} download={media.filename} target="_blank" rel="noreferrer">
        <Music2 size={16} /> {media.filename}
      </a>
      <button type="button" className="text-button"
        onClick={async () => share(
          new File([await toBytes(media.url)], media.filename,
            { type: media.content_type || 'application/octet-stream' }),
          media.filename,
          'Uma mensagem de voz 💜',
        )}>
        <Share2 size={15} /> WhatsApp / Compartilhar
      </button>
    </div>
  );
}

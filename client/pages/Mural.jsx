import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import MuralGallery from '../components/MuralGallery';
import { api, track } from '../lib/api';
import { saveAllCards } from '../components/LetterCard';
import { openSecureSupport } from '../lib/secureSupport.js';
import { muralTokenFromUrl, normalizeMuralUrl } from '../lib/muralAccess.js';
import { pendingLetterWhatsAppUrl } from '../lib/pendingLetterShare.js';
import {
  prepareWhatsAppPopup, navigateToWhatsApp, closeWhatsAppPopup,
} from '../lib/whatsappNavigation.js';

export default function Mural() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [opened, setOpened] = useState({});
  const [restoreErrors, setRestoreErrors] = useState({});
  const restoringRef = useRef(new Set());
  const [openBusy, setOpenBusy] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const muralToken = () => muralTokenFromUrl(window.location.href);

  const load = useCallback(async () => {
    try {
      const token = muralToken();
      const response = await api(`/api/mural/${encodeURIComponent(slug)}`, { token: token || undefined });
      setData(response);
      setError('');
      track('mural_view',{locked:!!response.locked,letters:response.cards?.length||0});
    } catch (cause) {
      setError(cause.message);
    }
  }, [slug]);

  useEffect(() => {
    const normalized=normalizeMuralUrl(window.location.href);
    if(normalized!==window.location.href)
      window.history.replaceState(window.history.state,'',normalized);
    load();
  }, [load]);

  // first_read_at belongs to the server, not localStorage. On a subsequent
  // visit, hydrate previously read letters without a second tap. Only an
  // authenticated mural grant may fetch the real card contents.
  useEffect(() => {
    if (data?.locked || !data?.cards?.length) return undefined;
    let cancelled = false;
    const previouslyRead = data.cards.filter(card =>
      card.already_opened && !card.draft_pending && !card.empty_content
    );
    async function restore() {
      // Small batches avoid overwhelming mobile Safari and keep each card
      // independent if one media fetch fails.
      for (let position = 0; position < previouslyRead.length && !cancelled; position += 3) {
        const batch = previouslyRead.slice(position, position + 3);
        await Promise.all(batch.map(async ({ id }) => {
          if (restoringRef.current.has(id)) return;
          restoringRef.current.add(id);
          try {
            const response = await api(
              '/api/mural/' + encodeURIComponent(slug) + '/cards/' + encodeURIComponent(id),
              { token: muralToken() || undefined },
            );
            if (!cancelled) setOpened(previous =>
              previous[id] ? previous : { ...previous, [id]: response.card }
            );
          } catch (cause) {
            if (!cancelled) setRestoreErrors(previous => ({
              ...previous, [id]: cause.message || 'Toque para tentar abrir novamente.',
            }));
          } finally {
            restoringRef.current.delete(id);
          }
        }));
      }
    }
    void restore();
    return () => { cancelled = true; };
  }, [data, slug]);

  async function openLetter(id) {
    if (opened[id] || openBusy) return;
    setOpenBusy(id);
    setError('');
    try {
      // Accessing the actual letter (not just listing the mural) records first read.
      const response = await api(
        `/api/mural/${encodeURIComponent(slug)}/cards/${encodeURIComponent(id)}`,
        { token: muralToken() || undefined },
      );
      setOpened((previous) => ({ ...previous, [id]: response.card }));
      setData(previous => previous ? {
        ...previous,
        cards: previous.cards.map(card => card.id === id ? { ...card, already_opened: true } : card),
      } : previous);
      setRestoreErrors(previous => ({ ...previous, [id]: '' }));
      track('private_letter_opened',{stage:'individual'});
    } catch (cause) {
      setError(cause.message);
    } finally {
      setOpenBusy('');
    }
  }

  async function downloadAll() {
    setBusy(true);
    try {
      // Downloading the full archive explicitly opens each included letter.
      // Reading an individual letter remains idempotent on the server.
      const cards = await Promise.all(data.cards
        .filter((envelope) => !envelope.draft_pending && !envelope.empty_content)
        .map(async (envelope) => {
        if (opened[envelope.id]) return opened[envelope.id];
        const response = await api(
          `/api/mural/${encodeURIComponent(slug)}/cards/${encodeURIComponent(envelope.id)}`,
          { token: muralToken() || undefined },
        );
        return response.card;
      }));
      setOpened((previous) => ({
        ...previous, ...Object.fromEntries(cards.map((card) => [card.id, card])),
      }));
      await saveAllCards(cards, data.recipient.name);
      track('mural_archive_downloaded',{letters:cards.length});
    } catch (cause) {
      setError(cause.message);
    } finally {
      setBusy(false);
    }
  }

  async function requestCompletion(id) {
    // The popup has to open directly on the user's tap, before the API call,
    // otherwise Safari and Chrome on iOS may block the WhatsApp handoff.
    const popup = prepareWhatsAppPopup('Preparando uma mensagem carinhosa… 💌');
    try {
      const grant = muralToken();
      if (!grant) throw new Error('Abra seu mural pelo link privado antes de enviar o recado.');
      const response = await api(
        '/api/mural/' + encodeURIComponent(slug) + '/cards/' +
          encodeURIComponent(id) + '/request-completion',
        { method: 'POST', data: {}, token: grant },
      );
      const url = pendingLetterWhatsAppUrl(response.url);
      navigateToWhatsApp(url, popup);
      track('recipient_request_letter_completion', { stage: 'unfinished_letter' });
      return response.url;
    } catch (cause) {
      closeWhatsAppPopup(popup);
      throw cause;
    }
  }

  const openHelp=async(id)=>{
    try{
      const grant=muralToken();
      await openSecureSupport({
        purpose:'support',name:data?.recipient?.name||'',
        ids:grant?(id?[id]:(data?.cards||[]).slice(0,20).map(card=>card.id)):[],
        recipientSlugs:[slug],muralSlug:slug,token:grant||undefined,
        stage:id?'cartinha_aberta':'mural',source:'mural',medium:'botao',
        campaign:'suporte_encontrista',content:id?'leitura':'mural'
      });
      track('recipient_support_whatsapp_clicked',{stage:id?'cartinha_aberta':'mural'});
    }catch(cause){setError(cause.message||'Não foi possível abrir o suporte.');}
  };
  return (
    <MuralGallery data={data} opened={opened} openBusy={openBusy} error={error} busy={busy}
      onOpenLetter={openLetter} onDownloadAll={downloadAll} onRefresh={load}
      onSupportClick={openHelp} onRequestCompletion={requestCompletion}
      restoreErrors={restoreErrors} />
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import MuralGallery from '../components/MuralGallery';
import { api, track } from '../lib/api';
import { saveAllCards } from '../components/LetterCard';
import { openSecureSupport } from '../lib/secureSupport.js';

export default function Mural() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [opened, setOpened] = useState({});
  const [openBusy, setOpenBusy] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const muralToken = () => new URLSearchParams(location.hash.slice(1)).get('token');

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

  useEffect(() => { load(); }, [load]);

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
      onSupportClick={openHelp} />
  );
}

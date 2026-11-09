import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CheckCheck, Eye, Heart, RefreshCw, Save, Send, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { LetterCard } from './LetterCard';
import { Sticker } from './letter/Sticker';
import { CAMPAIGN_SENDER, DEFAULT_CAMPAIGN, letterMarkdownToHtml, renderCampaignWhatsApp } from '../../shared/ejcCampaign.js';
import { FONTS, MAX_STICKERS, STICKERS, THEMES, normalizeComposition } from '../../shared/letter.js';
import '../styles/mini-mercado-campaign.css';

const places = [[27,24,-8],[73,40,7],[25,66,-5],[73,78,5],[49,55,4],[51,18,-3]];

export default function MiniMercadoCampaign({ onPublished }) {
  const [campaign, setCampaign] = useState(DEFAULT_CAMPAIGN);
  const [publishedCount, setPublishedCount] = useState(0);
  const [recipientCount, setRecipientCount] = useState(0);
  const [preview, setPreview] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const html=useMemo(()=>letterMarkdownToHtml(campaign.markdown),[campaign.markdown]);
  const composition=useMemo(()=>normalizeComposition(campaign.composition),[campaign.composition]);
  const update=(patch)=>{setCampaign(value=>({...value,...patch}));setDirty(true);setNotice('');};
  const updateComposition=(patch)=>update({
    composition:normalizeComposition({...composition,...patch,anonymous:false,authorName:CAMPAIGN_SENDER}),
  });

  const load=useCallback(async()=>{
    try {
      const data=await api('/api/admin/campaign/mini-mercado');
      setCampaign(data.campaign||DEFAULT_CAMPAIGN);
      setPublishedCount(Number(data.published_count||0));
      setRecipientCount(Number(data.active_recipients||0));
      setDirty(false);setError('');
    } catch(cause){setError(cause.message);}
  },[]);
  useEffect(()=>{load();},[load]);

  function toggleSticker(preset) {
    const existing=composition.stickers.find(item=>item.presetId===preset.id);
    if(existing){
      updateComposition({stickers:composition.stickers.filter(item=>item.id!==existing.id)});
      return;
    }
    if(composition.stickers.length>=MAX_STICKERS)return;
    const index=composition.stickers.length;
    const [x,y,rotate]=places[index];
    updateComposition({stickers:[...composition.stickers,{
      id:crypto.randomUUID(),presetId:preset.id,x,y,rotate,scale:.9,color:preset.colors[0],
    }]});
  }

  async function saveOnly(){
    setBusy('save');setError('');setNotice('');
    try {
      await api('/api/admin/campaign/mini-mercado',{method:'PUT',data:{
        title:campaign.title,markdown:campaign.markdown,
        whatsapp:campaign.whatsapp,composition,
      }});
      setDirty(false);
      setNotice('Carta e mensagem do WhatsApp salvas. Agora você pode publicá-las para todos.');
    }catch(cause){setError(cause.message);}
    finally{setBusy('');}
  }

  async function publishAll(){
    if(busy)return;
    const allowed=window.confirm(
      'Publicar a carta oficial do Mini Mercado para os '+recipientCount+' encontristas ativos?\n\n'+
      'Será um presente GRATUITO no mural pessoal de cada encontrista, sem Pix nem venda. '+
      'Se já existir uma carta dessa campanha, ela será atualizada apenas se ainda não tiver sido lida.\n\n'+
      'Você poderá abrir os WhatsApps individualmente depois; nada será enviado automaticamente.'
    );
    if(!allowed)return;
    setBusy('publish');setError('');setNotice('');
    try{
      await api('/api/admin/campaign/mini-mercado',{method:'PUT',data:{
        title:campaign.title,markdown:campaign.markdown,
        whatsapp:campaign.whatsapp,composition,
      }});
      setDirty(false);
      let cursor='',created=0,updated=0,untouched=0,processed=0;
      const seen=new Set();
      for(;;){
        if(seen.has(cursor))throw new Error('A paginação não avançou. Verifique os itens restantes.');
        seen.add(cursor);
        const data=await api('/api/admin/campaign/mini-mercado/publish',{
          method:'POST',data:{cursor},
        });
        processed+=Number(data.processed||0);
        created+=Number(data.created||0);
        updated+=Number(data.updated||0);
        untouched+=Number(data.unchanged||0);
        setNotice('Publicando: '+processed+' de '+recipientCount+' encontristas…');
        if(!data.next_cursor)break;
        cursor=data.next_cursor;
      }
      setNotice('💌 Campanha publicada! '+created+' novas cartinhas, '+updated+
        ' atualizadas, '+untouched+' preservadas. Abra o WhatsApp abaixo para convidar cada encontrista.');
      await Promise.all([load(),onPublished?.()]);
    }catch(cause){setError('A publicação foi interrompida: '+cause.message+
      '. As cartinhas já criadas foram preservadas. Toque novamente para continuar sem duplicar.');}
    finally{setBusy('');}
  }

  const waExample=renderCampaignWhatsApp(campaign.whatsapp,{
    name:'Maria',url:'https://ejc.migos.club/mural/SEU-LINK-PRIVADO',count:3,
  });

  return (
    <section className="mm-campaign form-card" aria-label="Campanha oficial Mini Mercado">
      <header className="mm-campaign-head">
        <div>
          <span className="eyebrow">PRESENTE OFICIAL · MINI MERCADO XX EJC</span>
          <h2><Heart size={24}/> Uma carta para cada encontrista 💛</h2>
          <p className="muted">Edite a história, escolha o papel e cole adesivos reais.
            Uma única publicação cria a carta gratuita nos murais de todos os encontristas ativos.</p>
        </div>
        <span className="mm-campaign-count">{publishedCount} de {recipientCount} murais</span>
      </header>
      <label className="mm-campaign-field">Título da carta
        <input value={campaign.title||''} maxLength={140} disabled={!!busy}
          onChange={event=>update({title:event.target.value})}/>
      </label>
      <label className="mm-campaign-field">Carta para todos · editor com formatação
        <textarea rows={15} spellCheck={true} value={campaign.markdown||''} disabled={!!busy}
          onChange={event=>update({markdown:event.target.value})}/>
      </label>
      <p className="muted small">Use **duas estrelas** para negrito, _sublinhados_ para itálico,
        ## no início de um parágrafo para título, e linhas em branco para separar os parágrafos. Emojis são bem-vindos! ✨</p>
      <div className="mm-campaign-design">
        <label>Cor do papel
          <select value={composition.theme} disabled={!!busy}
            onChange={event=>updateComposition({theme:event.target.value})}>
            {Object.entries(THEMES).map(([id,theme])=><option value={id} key={id}>{theme.label}</option>)}
          </select>
        </label>
        <label>Fonte
          <select value={composition.font} disabled={!!busy}
            onChange={event=>updateComposition({font:event.target.value})}>
            {Object.entries(FONTS).map(([id,font])=><option value={id} key={id}>{font.label}</option>)}
          </select>
        </label>
      </div>
      <div className="mm-campaign-stickers">
        <strong><Sparkles size={17}/> Escolha até {MAX_STICKERS} stickers ({composition.stickers.length} selecionados)</strong>
        <div className="mm-campaign-sticker-choices">
          {STICKERS.map(sticker=>{
            const chosen=composition.stickers.some(item=>item.presetId===sticker.id);
            return <button type="button" key={sticker.id} disabled={!!busy || (!chosen&&composition.stickers.length>=MAX_STICKERS)}
              aria-pressed={chosen} className={chosen?'chosen':''} title={sticker.text}
              onClick={()=>toggleSticker(sticker)}>
              <Sticker presetId={sticker.id} small/>
              <span>{sticker.text}</span>
              {chosen&&<Check size={16}/>}
            </button>;
          })}
        </div>
      </div>
      <button type="button" className="btn outline" onClick={()=>setPreview(v=>!v)}>
        <Eye size={17}/>{preview?'Ocultar prévia da cartinha':'Ver cartinha com texto e stickers'}
      </button>
      {preview&&<div className="mm-campaign-preview">
        <LetterCard letter={{sender_name:CAMPAIGN_SENDER,rich_html:html,composition,media:[]}}
          recipient="Você, encontrista 💛" actions={false} editable
          onCompositionChange={next=>updateComposition(next)} />
      </div>}
      <label className="mm-campaign-field">Mensagem formatada para WhatsApp
        <textarea rows={10} spellCheck={true} value={campaign.whatsapp||''} disabled={!!busy}
          onChange={event=>update({whatsapp:event.target.value})}/>
      </label>
      <p className="muted small">Variáveis: {'{nome}'} = primeiro nome, {'{link}'} = mural pessoal,
        {'{quantidade}'} = cartinhas prontas. O link é obrigatório na mensagem.</p>
      <div className="mm-campaign-whatsapp-preview">
        <strong>Prévia WhatsApp (exemplo)</strong>
        <p>{waExample}</p>
      </div>
      {dirty&&<p className="notice warning">Alterações ainda não salvas.</p>}
      {error&&<p role="alert" className="notice error">{error}</p>}
      {notice&&<p role="status" className="notice success">{notice}</p>}
      <div className="mm-campaign-actions">
        <button type="button" className="btn outline" disabled={!!busy} onClick={saveOnly}>
          <Save size={17}/>{busy==='save'?'Salvando…':'Salvar edição'}
        </button>
        <button type="button" className="btn" disabled={!!busy||!campaign.markdown.trim()||!campaign.whatsapp.includes('{link}')}
          onClick={publishAll}>
          <Send size={17}/>{busy==='publish'?'Publicando…':'Publicar carta para TODOS os encontristas'}
        </button>
        <button type="button" className="btn ghost" disabled={!!busy||dirty} onClick={load}>
          <RefreshCw size={17}/> Atualizar dados
        </button>
      </div>
      <small>Publicar a carta não envia mensagens pelo WhatsApp. O WhatsApp será aberto individualmente, com confirmação manual de envio.</small>
    </section>
  );
}

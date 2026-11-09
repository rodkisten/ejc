import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Copy, ExternalLink, ImagePlus, MessageCircle, Phone, RefreshCw } from 'lucide-react';
import { api, track } from '../lib/api';
import { readAdminListFilters, updateAdminListFilter } from '../lib/adminListFilters.js';
import { publishMuralOgImage } from '../lib/og';
import { muralInvitationMessage, whatsappShareUrl } from '../lib/recipientWhatsApp';
import { createSecureSupportContext } from '../lib/secureSupport.js';
import { navigateToWhatsApp, prepareWhatsAppPopup, closeWhatsAppPopup, isWhatsAppConfirmationPending, setWhatsAppConfirmationPending } from '../lib/whatsappNavigation.js';
import MiniMercadoCampaign from './MiniMercadoCampaign';
import { CAMPAIGN_KEY, renderCampaignWhatsApp } from '../../shared/ejcCampaign.js';
import '../styles/recipient-whatsapp.css';

export function RecipientPhoneEditor({ recipient, onRefresh }) {
  const [phone, setPhone] = useState(recipient.whatsapp_phone || '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => setPhone(recipient.whatsapp_phone || ''), [recipient.id, recipient.whatsapp_phone]);

  async function save(event) {
    event.preventDefault();
    setBusy(true); setNotice('');
    try {
      await api('/api/admin/recipients/'+recipient.id, {
        method: 'PATCH', data: { whatsapp_phone: phone },
      });
      await onRefresh?.();
      setNotice('Número salvo somente no admin.');
    } catch (cause) { setNotice(cause.message); }
    finally { setBusy(false); }
  }

  return (
    <form className="recipient-phone-editor" onSubmit={save}>
      <label htmlFor={'recipient-whatsapp-'+recipient.id}>
        <Phone size={15} /> WhatsApp do encontrista <small>(uso privado)</small>
      </label>
      <div className="recipient-phone-controls">
        <input type="tel" inputMode="tel" autoComplete="off" spellCheck={false}
          id={'recipient-whatsapp-'+recipient.id}
          placeholder="(32) 99966-2604" maxLength={25} value={phone}
          onChange={(event) => { setPhone(event.target.value); setNotice(''); }}
          disabled={busy} />
        <button type="submit" className="btn outline" disabled={busy || phone===(recipient.whatsapp_phone||'')}>
          <Check size={15} /> {busy ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
      {notice && <small className="recipient-phone-note" role="status">{notice}</small>}
    </form>
  );
}

export function WhatsAppShareButton({ recipient, onRefresh, compact = false, campaignKey = 'mural' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fallbackLink, setFallbackLink] = useState('');
  const confirmationKey = 'recipient:' + campaignKey + ':' + recipient.id;
  const [confirming, setConfirming] = useState(() => isWhatsAppConfirmationPending(confirmationKey));
  const [confirmedLocal, setConfirmedLocal] = useState(false);
  const ready=Number(recipient.ready_letter_count || 0);
  const isCampaign=campaignKey===CAMPAIGN_KEY;
  const published=Number(recipient.campaign_letter_count || 0)>0;
  const sent=confirmedLocal || Boolean(
    isCampaign?recipient.campaign_wa_sent_at:recipient.mural_wa_sent_at
  );
  const canSend=recipient.active!==0 && !!recipient.whatsapp_phone &&
    ready>0 && (!isCampaign || published);

  async function send() {
    // A popup created before awaiting API requests avoids Chrome iOS blocking it.
    const popup=prepareWhatsAppPopup('Preparando convite do XX EJC…');
    setBusy(true);setError('');setFallbackLink('');setConfirming(false);
    try{
      if(!recipient.mural_og_ready)await publishMuralOgImage(recipient);
      const details=await api('/api/admin/recipients/'+recipient.id+'/whatsapp-link',{
        method:'POST',data:{},
      });
      const context=await createSecureSupportContext({
        purpose:'invite',name:details.name,phone:details.phone,
        ids:details.letter_ids||[],recipientSlugs:[recipient.slug],
        stage:isCampaign?'convite_campanha':'convite_mural',
        source:'whatsapp',medium:'mensagem',
        campaign:isCampaign?'pos_encontro':'convite_mural',
        content:'convite_encontrista'
      });
      const trackedUrl=new URL(details.url);
      // The mural grant stays in the URL fragment, but operational attribution
      // and the contact's phone/IDs are encapsulated in the encrypted context.
      const opaque=new URL(context.link).searchParams.get('c');
      trackedUrl.search='?c='+encodeURIComponent(opaque);
      const inviteUrl=trackedUrl.toString();
      let message;
      if(isCampaign){
        const campaign=await api('/api/admin/campaign/mini-mercado');
        message=renderCampaignWhatsApp(campaign.campaign.whatsapp,{
          name:details.name,url:inviteUrl,count:Math.max(0,details.count-1),
        });
        message += '\n\n🆘 *Precisa de ajuda com suas cartinhas?*\n'+context.link+'\n_É só abrir e contar para a equipe o que aconteceu._';
      }else{
        message=muralInvitationMessage({name:details.name,url:inviteUrl,count:details.count,
          ids:details.letter_ids||[],supportUrl:context.link});
      }
      const href=whatsappShareUrl({phone:details.phone,message});
      track('admin_whatsapp_invite_opened',{stage:isCampaign?'campaign':'mural'});
      setFallbackLink(href);
      setConfirming(true);
      setWhatsAppConfirmationPending(confirmationKey, true);
      // Refresh before leaving. The confirmation prompt is also restored from
      // sessionStorage when the admin returns using the browser's Back button.
      try { await onRefresh?.(); } catch { /* Navigation still works if refresh fails. */ }
      navigateToWhatsApp(href, popup);
    }catch(cause){
      closeWhatsAppPopup(popup);
      setError(cause.message||'Não foi possível preparar o convite.');
    }finally{setBusy(false);}
  }

  async function confirmSent(){
    setBusy(true);setError('');
    try{
      await api('/api/admin/whatsapp/deliveries',{method:'POST',data:{
        recipient_id:recipient.id,campaign_key:campaignKey,image_sent:true,
      }});
      track('admin_whatsapp_invite_confirmed',{stage:isCampaign?'campaign':'mural'});
      setConfirmedLocal(true);setConfirming(false);
      setWhatsAppConfirmationPending(confirmationKey, false);
      await onRefresh?.();
    }catch(cause){setError(cause.message);}
    finally{setBusy(false);}
  }

  return (
    <div className={'whatsapp-action'+(compact?' is-compact':'')}>
      <button type="button" className="btn whatsapp-send-button" disabled={!canSend||busy}
        onClick={send} title={!recipient.whatsapp_phone?'Cadastre o WhatsApp primeiro':
          !ready?'Aguardando uma cartinha pronta':
          isCampaign&&!published?'Publique a carta do Mini Mercado primeiro':''}>
        <MessageCircle size={17}/>
        {busy?'Preparando…':sent?'Enviado ✅ · Reenviar':
          isCampaign?'Enviar carta do Mini Mercado':'Enviar mural pelo WhatsApp'}
      </button>
      {sent&&<small className="whatsapp-action-hint is-sent">✅ Enviado e confirmado manualmente.
        O botão continua ativo para reenviar.</small>}
      {!ready&&<small className="whatsapp-action-hint">Aguardando cartinhas prontas.</small>}
      {isCampaign&&!published&&<small className="whatsapp-action-hint">Publique a carta da campanha primeiro.</small>}
      {ready>0&&!recipient.whatsapp_phone&&<small className="whatsapp-action-hint">Salve o telefone antes de compartilhar.</small>}
      {error&&<p role="alert" className="notice error">{error}</p>}
      {fallbackLink&&<a href={fallbackLink} target="_blank" rel="noopener noreferrer" className="btn outline"
        onClick={()=>{
          setConfirming(true);
          setWhatsAppConfirmationPending(confirmationKey, true);
        }}>
        <ExternalLink size={15}/> Abrir WhatsApp
      </a>}
      {confirming&&<div className="whatsapp-send-confirm" role="group"
        aria-label={'Confirmar envio para '+recipient.name}>
        <strong>📸 Você enviou a imagem E a mensagem no WhatsApp para {recipient.name}?</strong>
        <p>Confirme apenas depois de realmente enviar no WhatsApp. Abrir o aplicativo não significa que foi enviado. A imagem do mural deve ser anexada manualmente, se desejar enviá-la como arquivo.</p>
        <div>
          <button type="button" className="btn" disabled={busy} onClick={confirmSent}>
            <Check size={16}/> Sim, enviei a imagem e a mensagem
          </button>
          <button type="button" className="btn outline" disabled={busy}
            onClick={()=>{
              setConfirming(false);
              setWhatsAppConfirmationPending(confirmationKey, false);
            }}>Ainda não enviei</button>
        </div>
      </div>}
    </div>
  );
}

const WHATSAPP_FILTERS = ['all', 'ready', 'sent', 'unsent', 'missing-phone'];

export default function WhatsAppAdmin({ info, reload }) {
  const [listParams, setListParams] = useSearchParams();
  const { search: query, filter: view } = readAdminListFilters(listParams, WHATSAPP_FILTERS);
  const setQuery = value => setListParams(current => updateAdminListFilter(current, 'busca', value),
    { replace: true, preventScrollReset: true });
  const setView = value => setListParams(current => updateAdminListFilter(current, 'situacao', value),
    { preventScrollReset: true });
  const [imageBusy, setImageBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [campaignPublished, setCampaignPublished] = useState(0);
  useEffect(()=>{api('/api/admin/campaign/mini-mercado')
    .then(data=>setCampaignPublished(Number(data.published_count||0)))
    .catch(()=>{});},[]);
  const updateCampaign=async()=>{
    await reload?.();
    try{
      const response=await api('/api/admin/campaign/mini-mercado');
      setCampaignPublished(Number(response.published_count||0));
    }catch{ /* existing admin errors remain visible elsewhere */ }
  };
  const withLetters=useMemo(()=>info.recipients.filter(
    person=>person.active!==0 && Number(person.order_count||0)>0
  ),[info.recipients]);
  const rows=useMemo(()=>withLetters.filter(person=>{
    if(view==='ready' && Number(person.ready_letter_count||0)===0)return false;
    if(view==='sent' && !person.campaign_wa_sent_at)return false;
    if(view==='unsent' && person.campaign_wa_sent_at)return false;
    if(view==='missing-phone' && person.whatsapp_phone)return false;
    return !query || person.name.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'));
  }),[withLetters,view,query]);
  const ready=withLetters.filter(person=>Number(person.ready_letter_count||0)>0).length;
  const sendable=withLetters.filter(person=>Number(person.ready_letter_count||0)>0 && !!person.whatsapp_phone).length;
  const sentCount=withLetters.filter(person=>person.campaign_wa_sent_at).length;
  const pendingCount=withLetters.filter(person=>!person.campaign_wa_sent_at&&person.whatsapp_phone).length;

  async function updateImage(person) {
    setImageBusy(person.id);setError('');setNotice('');
    try {
      await publishMuralOgImage(person);
      await reload();
      setNotice('Arte de '+person.name+' atualizada para o convite no WhatsApp.');
    } catch (cause) { setError(cause.message); }
    finally { setImageBusy(''); }
  }

  return (
    <section className="whatsapp-admin-page">
      <div className="section-head">
        <div>
          <span className="eyebrow">ENTREGA DAS CARTINHAS · XX EJC</span>
          <h1>Convites pelo WhatsApp 💌</h1>
          <p>Somente encontristas com cartinhas aparecem aqui. O link é pessoal, com uma mensagem de fé e prévia colorida gerada para cada mural.</p>
        </div>
      </div>
      <MiniMercadoCampaign onPublished={updateCampaign}/>
      <div className="whatsapp-summary">
        <div><strong>{withLetters.length}</strong><span>Com cartinhas vinculadas</span></div>
        <div><strong>{ready}</strong><span>Com cartinhas prontas</span></div>
        <div><strong>{sendable}</strong><span>Com WhatsApp cadastrado</span></div>
        <div><strong>{sentCount}</strong><span>Campanha enviada ✅</span></div>
        <div><strong>{pendingCount}</strong><span>Faltam enviar 💌</span></div>
      </div>
      <div className="notice">
        <MessageCircle size={20} />
        Depois de publicar a carta oficial para todos, abra o WhatsApp de cada encontrista.
        Confira a prévia e envie manualmente a mensagem e a imagem. Ao voltar, confirme que realmente enviou.
        O sistema não envia mensagens automaticamente.
      </div>
      <div className="whatsapp-toolbar">
        <input type="search" aria-label="Buscar encontrista" placeholder="Buscar encontrista…"
          value={query} onChange={event=>setQuery(event.target.value)} />
        <select aria-label="Filtrar convites" value={view} onChange={event=>setView(event.target.value)}>
          <option value="all">Todos com cartinhas</option>
          <option value="ready">Cartinhas prontas</option>
          <option value="sent">Campanha enviada ✅</option>
          <option value="unsent">Campanha não enviada</option>
          <option value="missing-phone">Sem telefone cadastrado</option>
        </select>
      </div>
      <div className="whatsapp-batch-actions">
        <button type="button" className="btn outline" onClick={()=>setView('unsent')}>
          <MessageCircle size={17}/> Mostrar apenas não enviados ({pendingCount})
        </button>
        <span>{campaignPublished>0?campaignPublished+' cartinhas oficiais publicadas':'Publique a campanha para habilitar os convites'}</span>
      </div>
      {error && <p role="alert" className="notice error">{error}</p>}
      {notice && <p role="status" className="notice success">{notice}</p>}
      <div className="whatsapp-recipient-list">
        {rows.map(person=>(
          <article className="whatsapp-recipient form-card" key={person.id}>
            <div className="whatsapp-recipient-overview">
              {person.photo_url?
                <img className="whatsapp-recipient-photo" src={person.photo_url} alt={'Foto de '+person.name}/>:
                <div className="whatsapp-recipient-photo placeholder">{person.name.slice(0,2).toUpperCase()}</div>}
              <div>
                <strong>{person.name}</strong>
                <small>{person.order_count} cartinha(s) vinculada(s) · {person.ready_letter_count||0} pronta(s)</small>
                <small>{person.mural_og_ready?'Prévia personalizada pronta':'Arte do mural será gerada antes do envio'}</small>
                <small>{person.campaign_wa_sent_at
                  ? '✅ Campanha enviada '+new Date(person.campaign_wa_sent_at).toLocaleString('pt-BR')+
                    ' · '+(person.campaign_wa_send_count||1)+' envio(s)'
                  : '💌 Campanha não enviada'}</small>
              </div>
            </div>
            {person.mural_og_url && <div className="whatsapp-og-thumb">
              <img src={person.mural_og_url} alt={'Miniatura social de '+person.name} />
            </div>}
            <RecipientPhoneEditor recipient={person} onRefresh={reload}/>
            <div className="whatsapp-recipient-actions">
              <WhatsAppShareButton recipient={person} onRefresh={reload} campaignKey={CAMPAIGN_KEY} />
              <WhatsAppShareButton recipient={person} onRefresh={reload} />
              <button type="button" className="btn outline" disabled={!!imageBusy}
                onClick={()=>updateImage(person)}>
                {imageBusy===person.id?<RefreshCw size={16}/>:<ImagePlus size={16}/>}
                {imageBusy===person.id?'Gerando…':'Atualizar OG do mural'}
              </button>
            </div>
          </article>
        ))}
      </div>
      {!rows.length && <p className="empty">Nenhum encontrista com cartinhas corresponde a esta busca.</p>}
    </section>
  );
}

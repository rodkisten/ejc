import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ClipboardCopy, ExternalLink, MessageCircle, RefreshCw, Trash2 } from 'lucide-react';
import { api, track } from '../lib/api';
import { readAdminListFilters, updateAdminListFilter, isReadyForSending,
  matchesSupportOrder } from '../lib/adminListFilters.js';
import { normalizeBrazilianWhatsApp } from '../lib/recipientWhatsApp';
import { supportContactParams } from '../lib/supportContactUrl.js';
import { createSecureSupportContext } from '../lib/secureSupport.js';
import { publishDraftOg } from '../lib/draftOg.js';
import {
  SUPPORT_TEMPLATE_FIELDS, loadCustomSupportTemplates, saveCustomSupportTemplates,
  validateCustomSupportTemplate, customSupportTemplateSeed, renderCustomSupportTemplate
} from '../lib/supportTemplateCustomization.js';
import {
  SUPPORT_MESSAGE_TEMPLATES, createSupportMessage, confirmedOrders,
  validContactName, supportRecipientNames,
} from '../lib/supportMessages';
import '../styles/support-messages.css';

const SUPPORT_FILTERS = ['all', 'ready', 'paid-draft', 'empty-paid-draft', 'pending'];

function WhatsAppTextPreview({ value }) {
  return (
    <div className="support-message-preview" aria-label="Prévia da formatação do WhatsApp">
      {String(value || '').split('\n').map((line, index) => (
        <React.Fragment key={index}>
          {index > 0 && '\n'}
          {line.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((segment, part) => {
            if (/^\*[^*\n]+\*$/.test(segment)) return <strong key={part}>{segment.slice(1, -1)}</strong>;
            if (/^_[^_\n]+_$/.test(segment)) return <em key={part}>{segment.slice(1, -1)}</em>;
            return <React.Fragment key={part}>{segment}</React.Fragment>;
          })}
        </React.Fragment>
      ))}
    </div>
  );
}

export default function AdminSupportMessages({ info }) {
  const location = useLocation();
  const [listParams, setListParams] = useSearchParams();
  const { search, filter } = readAdminListFilters(listParams, SUPPORT_FILTERS);
  const setSearch = value => setListParams(current => updateAdminListFilter(current, 'busca', value),
    { replace: true, preventScrollReset: true });
  const setFilter = value => setListParams(current => updateAdminListFilter(current, 'situacao', value),
    { preventScrollReset: true });
  const initial = location.state?.support || {};
  const fromUrl = supportContactParams(location.search);
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState(
    initial.recipient_slug ? [initial.recipient_slug] : []
  );
  const [template, setTemplate] = useState(
    initial.template || 'desculpas'
  );
  const [contactName, setContactName] = useState(initial.contact_name || '');
  const [contactWhatsApp, setContactWhatsApp] = useState(initial.contact_phone || '');
  const [selectedOrderIds, setSelectedOrderIds] = useState(
    initial.order_id ? [initial.order_id] : []
  );
  const [resumeUrl, setResumeUrl] = useState(initial.resume_url || '');
  const [generatingResume, setGeneratingResume] = useState(false);
  const [text, setText] = useState('');
  const [edited, setEdited] = useState(false);
  const [secureLinks,setSecureLinks] = useState(null);
  const [secureBusy,setSecureBusy] = useState(false);
  const [secureError,setSecureError] = useState('');
  const selectionScope = JSON.stringify([
    contactName, contactWhatsApp, selectedRecipients, selectedOrderIds, template
  ]);
  const [customTemplates, setCustomTemplates] = useState(() =>
    loadCustomSupportTemplates(typeof window === 'undefined' ? null : window.localStorage));
  const [customizing, setCustomizing] = useState(false);
  const [templateDraft, setTemplateDraft] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  useEffect(() => {
    let active = true;
    api('/api/admin/support-templates').then(response => {
      if (active) setCustomTemplates(response.templates || {});
    }).catch(() => { /* Keep the local cache if the server cannot be reached. */ });
    return () => { active = false; };
  }, []);


  async function reload() {
    setLoading(true);
    try {
      const response = await api('/api/admin/cartinhas');
      setLetters(response.letters || []);
      setError('');
    } catch (cause) {
      setError(cause.message || 'Não foi possível carregar os metadados.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); }, []);
  // A context URL can be safely opened from WhatsApp after an admin login.
  // The server resolves sensitive data only after authentication.
  useEffect(() => {
    const opaque=fromUrl.opaque;
    if(!opaque)return;
    let cancelled=false;
    api('/api/admin/support/context?c='+encodeURIComponent(opaque))
      .then(({context,orders})=>{
        if(cancelled)return;
        setContactName(context.name||'');
        setContactWhatsApp(context.phone||'');
        setSelectedRecipients(context.recipientSlugs||[]);
        setSelectedOrderIds((orders||[]).map(order=>order.id));
        setTemplate(context.purpose==='finished'?'recebida':'aguardando');
        setNotice('🔐 Atendimento recuperado. Os dados foram decifrados somente na sessão administrativa.');
      }).catch(cause=>{if(!cancelled)setError(cause.message);});
    return ()=>{cancelled=true;};
  },[fromUrl.opaque]);

  useEffect(() => {
    if (validContactName(contactName) || !initial.order_id || !letters.length) return;
    const matching = letters.find(letter => letter.id === initial.order_id);
    if (validContactName(matching?.sender_name)) setContactName(matching.sender_name);
  }, [letters, initial.order_id]);

  const recipients = useMemo(
    () => [...(info?.recipients || [])].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [info?.recipients]
  );
  const people = recipients.filter(person => selectedRecipients.includes(person.slug));
  const availableLetters = letters.filter(letter => selectedRecipients.includes(letter.recipient_slug) && !letter.gift);
  const selectedOrders = availableLetters.filter(letter => selectedOrderIds.includes(letter.id));
  const matchingLetters = useMemo(
    () => letters.filter(letter => matchesSupportOrder(letter, search, filter)),
    [letters, search, filter]
  );
  const visibleRelatedLetters = availableLetters.filter(letter => matchesSupportOrder(letter, search, filter));
  const hasSearchFilters = Boolean(search.trim() || filter !== 'all');
  const senderSuggestions = [...new Set(availableLetters.map(letter => letter.sender_name)
    .filter(validContactName))].sort((a,b) => a.localeCompare(b,'pt-BR'));
  const names = supportRecipientNames(people.map(person => person.name));

  const templateInfo = SUPPORT_MESSAGE_TEMPLATES.find(item => item.id === template);
  const missingName = !validContactName(contactName) && !templateInfo?.allowsMissingName;
  const missingRecipients = people.length === 0 && template !== 'pedir_nome';
  const readyToConfirm = confirmedOrders(selectedOrders);
  const emptyDraftsSelected = selectedOrders.length > 0 &&
    selectedOrders.every(letter => !letter.submitted && !letter.has_content);
  const invalidConfirm = templateInfo?.requiresSubmitted && !readyToConfirm;
  const invalidEmpty = template === 'rascunho_vazio' && !emptyDraftsSelected;
  const blocked = invalidConfirm || invalidEmpty;
  const canSend = !blocked && !!text.trim() && !secureBusy &&
    secureLinks?.scope === selectionScope &&
    !text.includes('🔐 Link protegido em preparação');
  useEffect(()=>{
    let active=true;
    setSecureLinks(null);
    setSecureError('');
    setSecureBusy(true);
    const timeout=setTimeout(async()=>{
      try{
        const base={
          name:contactName,phone:contactWhatsApp,
          recipientSlugs:selectedRecipients,
          ids:selectedOrderIds,
          source:'whatsapp',medium:'mensagem',
          campaign:'suporte_cartinhas',content:template,stage:'admin_mensagens'
        };
        const [help,send]=await Promise.all([
          createSecureSupportContext({...base,purpose:template==='recebida'?'finished':'support'}),
          createSecureSupportContext({...base,purpose:'send',ids:[]})
        ]);
        if(!active)return;
        const c=new URL(help.link).searchParams.get('c');
        const append=(path)=>{
          const u=new URL(path,window.location.origin);u.searchParams.set('c',c);
          return u.toString();
        };
        const bySlug={};
        for(const address of send.send_urls||[]){
          const parsed=new URL(address);
          const slug=parsed.pathname.split('/').pop();
          bySlug[slug]=address;
        }
        setSecureLinks({
          scope:selectionScope,
          help:help.link,recipientHelp:help.link,
          home:append('/'),open:append('/abrir'),
          sendBySlug:bySlug,admin:help.admin_url,letters:help.admin_letters_url
        });
      }catch(cause){if(active)setSecureError(cause.message);}
      finally{if(active)setSecureBusy(false);}
    },350);
    return()=>{active=false;clearTimeout(timeout);};
  },[contactName,contactWhatsApp,selectedRecipients.join('|'),
      selectedOrderIds.join('|'),template]);
  const validOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://ejc.migos.club';

  const customSource = customTemplates[template];
  const generated = useMemo(() => {
    // Preview is always useful, even before personal details or encrypted links are
    // available. Until the API supplies safe URLs, links are displayed as placeholders
    // that can never be sent to WhatsApp.
    const pending = '🔐 Link protegido em preparação';
    const links = (secureLinks?.scope === selectionScope ? secureLinks : null) || {
      help:pending,recipientHelp:pending,home:pending,open:pending,
      sendBySlug:Object.fromEntries(people.map(person => [person.slug,pending]))
    };
    try {
      const context = {
        contactName, recipientNames:names, recipients:people, orders:selectedOrders,
        origin:validOrigin, resumeUrl, secureLinks:links
      };
      return customSource
        ? renderCustomSupportTemplate(customSource, context)
        : createSupportMessage(template, { ...context, preview:true });
    } catch (cause) {
      return 'Não foi possível gerar o modelo. Escolha outro ou restaure o original.';
    }
  }, [template, customSource, contactName, selectedRecipients.join('|'),
    selectedOrderIds.join('|'), names.join('|'), letters, resumeUrl, validOrigin, secureLinks]);
  // Keep the author's manual edits across background refreshes and selections.
  useEffect(() => {
    if (!edited) setText(generated);
  }, [generated, edited]);
  // Changes to contact identity or linked orders must regenerate encrypted URLs.
  // A manual edit from the previous contact must never be reused with another.
  useEffect(() => { setEdited(false); }, [selectionScope, resumeUrl]);

  function beginCustomization() {
    try {
      setTemplateDraft(customSource || customSupportTemplateSeed(template));
      setCustomizing(true);
      setError('');
    } catch (cause) { setError(cause.message); }
  }
  async function saveTemplate() {
    setSavingTemplate(true);
    try {
      const clean = validateCustomSupportTemplate(templateDraft);
      const next = { ...customTemplates, [template]: clean };
      await api('/api/admin/support-templates', { method:'PUT', data:{ templates:next } });
      try { saveCustomSupportTemplates(window.localStorage, next); } catch { /* Cache optional. */ }
      setCustomTemplates(next);
      setEdited(false);
      setCustomizing(false);
      setNotice('✅ Modelo salvo no sistema para uso da equipe em outros dispositivos.');
      setError('');
    } catch (cause) { setError(cause.message || 'Não foi possível salvar.'); }
    finally { setSavingTemplate(false); }
  }
  async function restoreTemplate() {
    setSavingTemplate(true);
    try {
      const next = { ...customTemplates };
      delete next[template];
      await api('/api/admin/support-templates', { method:'PUT', data:{ templates:next } });
      try { saveCustomSupportTemplates(window.localStorage, next); } catch { /* Cache optional. */ }
      setCustomTemplates(next);
      setEdited(false);
      setCustomizing(false);
      setNotice('✅ Modelo original restaurado no sistema.');
      setError('');
    } catch (cause) { setError(cause.message || 'Não foi possível restaurar.'); }
    finally { setSavingTemplate(false); }
  }

  function addRecipient(slug) {
    if (!slug || selectedRecipients.includes(slug)) return;
    setSelectedRecipients(previous => [...previous, slug]);
    setNotice('');
  }
  function removeRecipient(slug) {
    setSelectedRecipients(previous => previous.filter(item => item !== slug));
    const ids = new Set(letters.filter(letter => letter.recipient_slug === slug).map(letter => letter.id));
    setSelectedOrderIds(previous => previous.filter(id => !ids.has(id)));
    setNotice('');
  }

  function selectMatchingLetter(letter) {
    setSelectedRecipients(previous => previous.includes(letter.recipient_slug)
      ? previous : [...previous, letter.recipient_slug]);
    setSelectedOrderIds(previous => previous.includes(letter.id)
      ? previous : [...previous, letter.id]);
    if (!validContactName(contactName) && validContactName(letter.sender_name)) {
      setContactName(letter.sender_name);
    }
    setNotice('✅ Cartinha de ' + letter.recipient_name + ' selecionada para o atendimento.');
  }

  // The chosen recipients come from the admin's D1-backed orders, never a
  // hardcoded name. PNGs are cached per exact set of selected draft IDs.
  async function createResumeLinks(){
    const drafts=selectedOrders.filter(order=>
      !order.submitted&&['paid','preparing','delivered'].includes(order.status));
    if(!drafts.length){
      setError('Selecione uma ou mais cartinhas pagas ainda em rascunho.');
      return;
    }
    setGeneratingResume(true);setError('');
    try{
      const created=[];
      for(const letter of drafts){
        const response=await api('/api/admin/cartinhas/'+encodeURIComponent(letter.id)+
          '/resume-link',{method:'POST',data:{}});
        const context=await createSecureSupportContext({
          purpose:'draft',name:contactName,phone:contactWhatsApp,
          ids:[letter.id],recipientSlugs:[letter.recipient_slug],
          source:'whatsapp',medium:'mensagem',
          campaign:'recuperacao_cartinha',content:'rascunho_pago',stage:'retomar_edicao'
        });
        const link=new URL(response.resume_url);
        link.search='?c='+encodeURIComponent(new URL(context.link).searchParams.get('c'));
        created.push({name:letter.recipient_name,url:link.toString()});
      }
      setResumeUrl(created.length===1?created[0].url:
        created.map(item=>'• '+item.name+': '+item.url).join('\n'));
      try{
        await publishDraftOg(drafts);
        setNotice('✅ '+created.length+' link(s) privado(s) e OG personalizada gerados com os nomes selecionados.');
      }catch(ogError){
        setNotice('✅ '+created.length+' link(s) privado(s) gerados. A OG personalizada não pôde ser publicada: '+
          ogError.message);
      }
    }catch(cause){setError(cause.message||'Não foi possível preparar os links de continuação.');}
    finally{setGeneratingResume(false);}
  }

  async function ensurePersonalizedDraftOg() {
    const drafts=selectedOrders.filter(order=>
      !order.submitted&&['paid','preparing','delivered'].includes(order.status));
    if(!drafts.length)return null;
    return publishDraftOg(drafts);
  }

  async function copyMessage() {
    if (!canSend) return;
    try {
      // Clipboard needs the user gesture, particularly on iPhone Safari.
      // Publish the image only after successfully capturing the copied text.
      await navigator.clipboard.writeText(text);
      setNotice('✅ Mensagem copiada com a formatação do WhatsApp!');
      try {
        const generated=await ensurePersonalizedDraftOg();
        if(generated)setNotice('✅ Mensagem copiada! OG personalizada para '+
          generated.recipients.join(', ')+' publicada automaticamente.');
      } catch (cause) {
        setNotice('✅ Mensagem copiada. A prévia personalizada não pôde ser publicada: '+
          cause.message);
      }
      track('admin_support_template_copied', { stage: template });
    } catch {
      window.prompt('Copie a mensagem:', text);
    }
  }
  function openWhatsApp() {
    if (!canSend) return;
    const phone = contactWhatsApp.trim();
    const number = phone ? normalizeBrazilianWhatsApp(phone) : '';
    if (phone && !number) {
      setError('Informe um WhatsApp válido com DDD ou deixe vazio para escolher a conversa.');
      return;
    }
    const url = number
      ? 'https://wa.me/' + number + '?text=' + encodeURIComponent(text)
      : 'https://api.whatsapp.com/send?text=' + encodeURIComponent(text);
    // All links are already securely generated. Open directly on the iPhone tap.
    const opened = window.open(url,'_blank');
    if (opened) opened.opener = null;
    else window.location.assign(url);
    setError('');
    setNotice('WhatsApp aberto. Confira a conversa e envie manualmente.');
    track('admin_support_template_whatsapp_opened',{stage:template});
    ensurePersonalizedDraftOg().then(image => {
      if (image) setNotice('WhatsApp aberto. A arte personalizada também foi atualizada.');
    }).catch(cause => {
      setNotice('WhatsApp aberto. Não foi possível atualizar a arte: '+cause.message);
    });
  }

  return (
    <section className="support-messages-page">
      <div className="section-head">
        <div>
          <span className="eyebrow">MINI MERCADO · XX EJC SIMONÉSIA</span>
          <h1>💌 Mensagens de suporte</h1>
          <p>Respostas carinhosas, personalizadas e prontas para o WhatsApp, com links de acompanhamento.</p>
        </div>
        <button className="btn outline" type="button" onClick={reload} disabled={loading}>
          <RefreshCw size={16} /> {loading ? 'Atualizando…' : 'Atualizar cartinhas'}
        </button>
      </div>

      <div className="support-messages-layout">
        <div className="support-messages-fields">
          <section className="form-card support-messages-card">
            <h2>1. Quem entrou em contato?</h2>
            <label htmlFor="support-contact-name">Nome da pessoa que escreveu para a equipe</label>
            <input id="support-contact-name" type="text" maxLength={100} autoComplete="off"
              list="support-senders" value={contactName}
              placeholder="Ex.: Mariana, mãe de João"
              onChange={event => {setContactName(event.target.value);setNotice('');}} />
            <datalist id="support-senders">
              {senderSuggestions.map(name => <option key={name} value={name} />)}
            </datalist>
            {!validContactName(contactName) &&
              <div className="notice warning support-message-inline-warning">
                <span>⚠️ Não temos o nome de quem entrou em contato. Peça a identificação antes de enviar uma resposta personalizada.</span>
                <button className="btn ghost" type="button" onClick={() => {setTemplate('pedir_nome');setEdited(false);setCustomizing(false);}}>
                  Usar mensagem para pedir o nome
                </button>
              </div>}
            {senderSuggestions.length > 0 && <div className="support-sender-suggestions">
              <small>Remetentes encontrados nas cartinhas selecionadas:</small>
              <div className="inline-actions">
                {senderSuggestions.slice(0, 8).map(name => <button type="button" className="btn ghost"
                  key={name} onClick={() => setContactName(name)}>{name}</button>)}
              </div>
            </div>}
            <label htmlFor="support-contact-phone">WhatsApp da pessoa <small>(opcional)</small></label>
            <input id="support-contact-phone" type="tel" inputMode="tel" autoComplete="off"
              placeholder="(33) 99999-9999" value={contactWhatsApp}
              onChange={event => setContactWhatsApp(event.target.value.slice(0,25))}/>
            <small>Nome, telefone, IDs e UTMs são armazenados somente no contexto criptografado do link, que expira em 14 dias.</small>
            <button type="button" className="btn ghost" disabled={!secureLinks}
              onClick={async()=>{
                try{
                  await navigator.clipboard.writeText(secureLinks.admin);
                  setNotice('✅ Link criptografado do atendimento copiado!');
                }catch{
                  if(secureLinks)window.prompt('Copie o link seguro do atendimento:',secureLinks.admin);
                }
              }}>🔗 Copiar link seguro do atendimento</button>
            {secureLinks && <a className="btn outline" href={secureLinks.letters}
              target="_blank" rel="noopener noreferrer">
              👁 Conferir cartinhas relacionadas no admin
            </a>}
            {secureBusy&&<small>🔐 Preparando links protegidos…</small>}
            {secureError&&<div className="notice error" role="alert">{secureError}</div>}
          </section>

          <section className="form-card support-messages-card">
            <h2>2. Para qual encontrista?</h2>
            <div className="support-filter-grid">
              <label htmlFor="support-order-search">
                Buscar por encontrista, remetente ou ID
                <input id="support-order-search" type="search" value={search}
                  placeholder="Buscar cartinhas…" autoComplete="off"
                  onChange={event => setSearch(event.target.value)} />
              </label>
              <label htmlFor="support-order-filter">
                Situação das cartinhas
                <select id="support-order-filter" value={filter}
                  onChange={event => setFilter(event.target.value)}>
                  <option value="all">Todas as situações</option>
                  <option value="ready">💌 Prontos para envio</option>
                  <option value="paid-draft">Pagas, ainda em rascunho</option>
                  <option value="empty-paid-draft">Pagas, sem conteúdo</option>
                  <option value="pending">Pix pendente</option>
                </select>
              </label>
              {hasSearchFilters && <button type="button" className="btn ghost"
                onClick={() => {
                  setListParams(current => {
                    const next = updateAdminListFilter(current, 'busca', '');
                    return updateAdminListFilter(next, 'situacao', 'all');
                  }, { preventScrollReset: true });
                }}>Limpar filtros</button>}
            </div>
            <small className="muted">Os filtros de busca e situação ficam na URL.
              Nome e telefone do atendimento não são incluídos nesses parâmetros.</small>
            {hasSearchFilters && <div className="support-search-results">
              <strong aria-live="polite">{matchingLetters.length} cartinha(s) encontrada(s)</strong>
              {matchingLetters.length > 0 ? <div className="support-order-list">
                {matchingLetters.slice(0, 60).map(letter => <div
                  className="support-order-item support-order-result" key={letter.id}>
                  <span>
                    <strong>{letter.recipient_name}</strong>
                    <small>{letter.id} · {letter.sender_name}</small>
                    <small className={isReadyForSending(letter) ? 'is-ready' : ''}>
                      {isReadyForSending(letter) ? '✅ Pronta para envio' :
                        letter.submitted ? 'Pix pendente ou em conferência' :
                        !letter.has_content ? '⚠️ Sem conteúdo finalizado' : '📝 Rascunho com conteúdo'}
                    </small>
                  </span>
                  <button type="button" className="btn outline"
                    disabled={selectedOrderIds.includes(letter.id)}
                    onClick={() => selectMatchingLetter(letter)}>
                    {selectedOrderIds.includes(letter.id) ? '✓ Selecionada' : 'Selecionar'}
                  </button>
                </div>)}
              </div> : <small className="muted">Nenhuma cartinha corresponde aos filtros escolhidos.</small>}
              {matchingLetters.length > 60 && <small className="muted">
                Exibindo as primeiras 60 cartinhas. Refine a busca para encontrar uma específica.
              </small>}
            </div>}
            <label htmlFor="support-recipient-select">Selecione um ou vários encontristas</label>
            <select id="support-recipient-select" value=""
              onChange={event => addRecipient(event.target.value)}>
              <option value="">Adicionar encontrista…</option>
              {recipients.filter(person => !selectedRecipients.includes(person.slug)).map(person =>
                <option key={person.id} value={person.slug}>{person.name}</option>)}
            </select>
            <div className="support-selected-people" aria-live="polite">
              {people.map(person => <span className="support-person-chip" key={person.id}>
                {person.name}
                <button type="button" aria-label={'Remover '+person.name} onClick={() => removeRecipient(person.slug)}>
                  <Trash2 size={13} />
                </button>
              </span>)}
              {!people.length && <small className="muted">Escolha um encontrista para personalizar o texto e os links.</small>}
            </div>
            {availableLetters.length > 0 && <>
              <h3>Cartinhas relacionadas</h3>
              <p className="muted small">Marque apenas as cartinhas que fazem parte desta conversa. Os IDs são incluídos na mensagem e nos links de suporte, sem revelar o conteúdo.</p>
              <div className="support-order-list">
                {visibleRelatedLetters.map(letter =>
                  <label className="support-order-item" key={letter.id}>
                    <input type="checkbox" checked={selectedOrderIds.includes(letter.id)}
                      onChange={event => setSelectedOrderIds(previous => event.target.checked
                        ? [...previous,letter.id]
                        : previous.filter(id => id!==letter.id))}/>
                    <span>
                      <strong>{letter.recipient_name}</strong>
                      <small>{letter.id} · {letter.sender_name}</small>
                      <small className={letter.submitted && ['paid','preparing','delivered'].includes(letter.status)
                        ? 'is-ready' : ''}>
                        {letter.submitted ? '✅ Enviada' :
                          !letter.has_content ? '⚠️ Sem conteúdo finalizado' : '📝 Rascunho com conteúdo'}
                        {' · '}{['paid','preparing','delivered'].includes(letter.status) ? 'Pix confirmado' : 'Pix pendente'}
                      </small>
                    </span>
                    <Link to={'/admin/pedidos/'+encodeURIComponent(letter.id)}
                      title={'Abrir pedido '+letter.id} onClick={event => event.stopPropagation()}>
                      <ExternalLink size={15} />
                    </Link>
                  </label>)}
              </div>
              {!visibleRelatedLetters.length && <small className="muted">
                Nenhuma cartinha relacionada corresponde à busca atual. As seleções permanecem guardadas.
              </small>}
            </>}
          </section>

          <section className="form-card support-messages-card">
            <h2>3. Escolha a resposta</h2>
            <label htmlFor="support-template-select">Modelo de mensagem</label>
            <select id="support-template-select" value={template}
              onChange={event => {setTemplate(event.target.value);setEdited(false);setCustomizing(false);setNotice('');}}>
              {[...new Set(SUPPORT_MESSAGE_TEMPLATES.map(item => item.group))].map(group =>
                <optgroup label={group} key={group}>
                  {SUPPORT_MESSAGE_TEMPLATES.filter(item => item.group===group).map(item =>
                    <option value={item.id} key={item.id}>{item.title}</option>)}
                </optgroup>)}
            </select>
            <p className="muted small">{templateInfo?.summary}</p>
            <div className="support-template-custom-actions">
              <button type="button" className="btn outline" onClick={beginCustomization}>
                {customSource ? '✏️ Editar modelo personalizado' : '✏️ Personalizar este modelo'}
              </button>
              {customSource && <button type="button" className="btn ghost" disabled={savingTemplate}
                onClick={restoreTemplate}>Restaurar modelo original</button>}
            </div>
            {customizing && <div className="support-template-customizer">
              <label htmlFor="support-template-source">Modelo reutilizável para toda a equipe</label>
              <p className="muted small">Use as variáveis para personalizar automaticamente cada atendimento.
                Os modelos são salvos no sistema, sem códigos individuais nem links de acesso privados.</p>
              <div className="support-template-variables">
                {SUPPORT_TEMPLATE_FIELDS.map(field => <button key={field} type="button"
                  onClick={() => setTemplateDraft(previous => previous + (previous ? ' ' : '') + field)}>
                  {field}
                </button>)}
              </div>
              <textarea id="support-template-source" className="support-template-source"
                rows={12} value={templateDraft}
                onChange={event => setTemplateDraft(event.target.value)}/>
              <div className="support-template-custom-actions">
                <button className="btn" type="button" onClick={saveTemplate} disabled={savingTemplate}>
                  {savingTemplate ? 'Salvando modelo…' : 'Salvar meu modelo'}
                </button>
                <button className="btn ghost" type="button" onClick={() => setCustomizing(false)}>
                  Cancelar
                </button>
              </div>
            </div>
            {(template==='rascunho_vazio'||template==='link_privado')&&<>
              <label htmlFor="support-resume-link">Link privado de continuação <small>(se o administrador já gerou um)</small></label>
              <input id="support-resume-link" type="url" autoComplete="off" spellCheck={false}
                value={resumeUrl} onChange={event => setResumeUrl(event.target.value)}
                placeholder="https://ejc.migos.club/pedido/…" />
              <button type="button" className="btn outline" disabled={generatingResume}
                onClick={createResumeLinks}>
                {generatingResume?'Preparando links e arte…':'💌 Gerar automaticamente link(s) e OG com os nomes'}
              </button>
              <small>Os nomes são obtidos dos pedidos selecionados. Os links são pessoais:
                só envie à pessoa que escreveu as cartinhas. Não são enviados ao Analytics.</small>
            </>}
            {invalidConfirm && <p className="notice warning">Para afirmar que a cartinha foi recebida, selecione pelo menos um pedido com <strong>Pix confirmado e envio finalizado</strong>.</p>}
            {invalidEmpty && <p className="notice warning">Para avisar sobre uma cartinha vazia, selecione uma que esteja realmente sem conteúdo e sem envio finalizado.</p>}
            {error && <p className="notice error" role="alert">{error}</p>}
          </section>
        </div>

        <div className="support-message-editor-area">
          <section className="form-card support-message-editor">
            <div className="support-message-editor-header">
              <div>
                <span className="eyebrow">PRONTO PARA WHATSAPP</span>
                <h2>4. Revise e envie 💚</h2>
              </div>
              <span className="muted small">{text.length} caracteres</span>
            </div>
            {missingName && template !== 'pedir_nome' && <div className="notice warning">
              Nenhum nome informado ainda. A prévia usa uma saudação genérica até você preencher o contato.
              Você também pode escolher “Qual é seu nome?”.
            </div>}
            {missingRecipients && template !== 'pedir_nome' && <p className="muted small">
              Selecione encontristas acima para incluir os nomes e IDs. Você já pode revisar o texto.
            </p>}
            {blocked && <div className="notice warning" role="alert">
              {invalidConfirm
                ? 'Selecione cartinhas pagas e finalizadas antes de confirmar recebimento. Você ainda pode revisar a prévia.'
                : 'Selecione cartinhas realmente vazias e não finalizadas para usar este aviso. A prévia continua editável.'}
            </div>}
            <label htmlFor="support-editor">Mensagem editável para WhatsApp</label>
            <textarea id="support-editor" className="support-textarea" value={text} rows={18}
              placeholder="Escreva ou adapte uma mensagem de atendimento aqui."
              onChange={event => {setText(event.target.value);setEdited(true);}}/>
            <div className="support-message-editor-tools">
              <span className="muted small">Use *negrito*, _itálico_ e emojis. A prévia abaixo é atualizada na hora.</span>
              {edited && <button type="button" className="text-button"
                onClick={() => {setText(generated);setEdited(false);}}>
                Restaurar mensagem e links protegidos
              </button>}
            </div>
            {(secureBusy || !secureLinks) && <p className="muted small">
              🔐 {secureBusy ? 'Preparando links seguros para envio…' :
                'Os links seguros ainda não estão disponíveis. Confira a conexão antes de enviar.'}
            </p>}
            <div className="support-message-actions">
              <button type="button" className="btn" disabled={!canSend} onClick={copyMessage}>
                <ClipboardCopy size={17}/> Copiar mensagem
              </button>
              <button type="button" className="btn outline" disabled={!canSend} onClick={openWhatsApp}>
                <MessageCircle size={17}/> Abrir WhatsApp
              </button>
            </div>
            {notice && <p className="notice success" role="status">{notice}</p>}
            <details className="support-preview-details" open>
              <summary>Prévia com negrito e itálico</summary>
              {text.trim() ? <WhatsAppTextPreview value={text} /> :
                <p className="support-message-preview">Escreva a mensagem para visualizar a prévia.</p>}
            </details>
            <p className="muted small">O WhatsApp abre para revisão. <strong>O sistema não envia automaticamente.</strong> Confira o destinatário e toque em Enviar no aplicativo.</p>
          </section>
        </div>
      </div>
    </section>
  );
}

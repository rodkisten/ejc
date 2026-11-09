import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ClipboardCopy, ExternalLink, MessageCircle, RefreshCw, Trash2 } from 'lucide-react';
import { api, track } from '../lib/api';
import { normalizeBrazilianWhatsApp } from '../lib/recipientWhatsApp';
import { supportContactParams, supportContactAdminUrl } from '../lib/supportContactUrl.js';
import { publishDraftOg } from '../lib/draftOg.js';
import {
  SUPPORT_TEMPLATE_FIELDS, loadCustomSupportTemplates, saveCustomSupportTemplates,
  validateCustomSupportTemplate, customSupportTemplateSeed, renderCustomSupportTemplate,
} from '../lib/supportTemplateCustomization.js';
import {
  SUPPORT_MESSAGE_TEMPLATES, createSupportMessage, confirmedOrders,
  validContactName, supportRecipientNames,
} from '../lib/supportMessages';
import '../styles/support-messages.css';

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
  const navigate = useNavigate();
  const initial = location.state?.support || {};
  const fromUrl = supportContactParams(location.search);
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState(
    fromUrl.recipients.length ? fromUrl.recipients :
      initial.recipient_slug ? [initial.recipient_slug] : []
  );
  const [template, setTemplate] = useState(
    SUPPORT_MESSAGE_TEMPLATES.some(item => item.id === fromUrl.template)
      ? fromUrl.template : initial.template || 'desculpas'
  );
  const [contactName, setContactName] = useState(fromUrl.name || initial.contact_name || '');
  const [contactWhatsApp, setContactWhatsApp] = useState(fromUrl.phone || initial.contact_phone || '');
  const [selectedOrderIds, setSelectedOrderIds] = useState(
    fromUrl.orders.length ? fromUrl.orders :
      initial.order_id ? [initial.order_id] : []
  );
  const [resumeUrl, setResumeUrl] = useState(initial.resume_url || '');
  const [generatingResume, setGeneratingResume] = useState(false);
  const [text, setText] = useState('');
  const [edited, setEdited] = useState(false);
  const [customTemplates, setCustomTemplates] = useState(() =>
    loadCustomSupportTemplates(typeof window === 'undefined' ? null : window.localStorage));
  const [customizing, setCustomizing] = useState(false);
  const [templateDraft, setTemplateDraft] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  useEffect(() => {
    let active = true;
    api('/api/admin/support-templates').then(response => {
      if (active) setCustomTemplates(response.templates || {});
    }).catch(() => {
      // The local cache still allows previously saved messages to be edited.
    });
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
  // Reflect the contact and operational selection in the admin URL, so a link
  // opened from support can prefill WhatsApp without storing a private token.
  useEffect(() => {
    const next = supportContactAdminUrl({
      name: contactName, phone: contactWhatsApp,
      recipients: selectedRecipients, orders: selectedOrderIds, template
    });
    if (next !== location.pathname + location.search) {
      navigate(next, { replace: true, state: location.state });
    }
  }, [contactName, contactWhatsApp, selectedRecipients, selectedOrderIds, template,
      location.pathname, location.search, location.state, navigate]);

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
  // A response may be previewed and edited before contact details are supplied.
  // Only statements about paid/sent or empty drafts require verified order selection.
  const blocked = invalidConfirm || invalidEmpty;
  const canSend = !blocked && !!text.trim();
  const validOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://ejc.migos.club';
  const customSource = customTemplates[template];

  const generated = useMemo(() => {
    try {
      const context = {
        contactName, recipientNames: names, recipients: people,
        orders: selectedOrders, origin: validOrigin, resumeUrl,
      };
      return customSource
        ? renderCustomSupportTemplate(customSource, context)
        : createSupportMessage(template, { ...context, preview: true });
    } catch (cause) {
      return 'Não foi possível gerar este modelo. Selecione outro ou restaure o original.';
    }
  }, [template, customSource, contactName, selectedRecipients.join('|'),
    selectedOrderIds.join('|'), names.join('|'), letters, resumeUrl, validOrigin]);
  // Never overwrite a manual edit on a background reload or contact change.
  useEffect(() => {
    if (!edited) setText(generated);
  }, [generated, edited]);

  function beginCustomization() {
    try {
      setTemplateDraft(customSource || customSupportTemplateSeed(template));
      setCustomizing(true);
      setError('');
    } catch (cause) {
      setError(cause.message);
    }
  }
  async function saveTemplate() {
    setSavingTemplate(true);
    try {
      const cleaned = validateCustomSupportTemplate(templateDraft);
      const next = { ...customTemplates, [template]: cleaned };
      await api('/api/admin/support-templates', { method: 'PUT', data: { templates: next } });
      try { saveCustomSupportTemplates(window.localStorage, next); } catch { /* Cache is optional. */ }
      setCustomTemplates(next);
      setEdited(false);
      setCustomizing(false);
      setNotice('✅ Modelo personalizado salvo no sistema. Você poderá reutilizá-lo em outros atendimentos e dispositivos.');
      setError('');
    } catch (cause) {
      setError(cause.message || 'Não foi possível salvar o modelo.');
    } finally {
      setSavingTemplate(false);
    }
  }
  async function restoreTemplate() {
    setSavingTemplate(true);
    try {
      const next = { ...customTemplates };
      delete next[template];
      await api('/api/admin/support-templates', { method: 'PUT', data: { templates: next } });
      try { saveCustomSupportTemplates(window.localStorage, next); } catch { /* Cache is optional. */ }
      setCustomTemplates(next);
      setEdited(false);
      setCustomizing(false);
      setNotice('Modelo original restaurado no sistema.');
      setError('');
    } catch (cause) {
      setError(cause.message || 'Não foi possível restaurar o modelo.');
    } finally {
      setSavingTemplate(false);
    }
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
        const link=new URL(response.resume_url);
        link.searchParams.set('utm_source','whatsapp');
        link.searchParams.set('utm_medium','mensagem');
        link.searchParams.set('utm_campaign','recuperacao_cartinha');
        link.searchParams.set('utm_content','rascunho_pago');
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
      setError('Informe um WhatsApp válido com DDD ou deixe o campo vazio para escolher a conversa no aplicativo.');
      return;
    }
    const url = number
      ? 'https://wa.me/' + number + '?text=' + encodeURIComponent(text)
      : 'https://api.whatsapp.com/send?text=' + encodeURIComponent(text);
    // Open during the tap, before any asynchronous OG publishing. This matters
    // on Safari iPhone, which blocks popups opened after an awaited promise.
    const opened = window.open(url, '_blank');
    if (opened) opened.opener = null;
    else window.location.assign(url);
    setError('');
    setNotice('WhatsApp aberto para revisão. Confira a conversa e envie manualmente.');
    track('admin_support_template_whatsapp_opened', { stage: template });
    ensurePersonalizedDraftOg().then(image => {
      if (image) setNotice('WhatsApp aberto. A arte personalizada dos rascunhos foi atualizada.');
    }).catch(cause => {
      setNotice('WhatsApp aberto. A arte personalizada não pôde ser atualizada: ' + cause.message);
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
            <small>O nome e o WhatsApp entram na URL desta aba para preencher os próximos links de atendimento. Não são gravados no banco nem enviados ao Analytics. Use apenas links internos da equipe.</small>
            <button type="button" className="btn ghost" onClick={async () => {
              const url=window.location.origin+supportContactAdminUrl({
                name:contactName,phone:contactWhatsApp,
                recipients:selectedRecipients,orders:selectedOrderIds,template
              });
              try {
                await navigator.clipboard.writeText(url);
                setNotice('✅ Link do atendimento com nome e telefone copiado!');
              } catch {
                window.prompt('Copie o link do atendimento:',url);
              }
            }}>🔗 Copiar link preenchido do atendimento</button>
          </section>

          <section className="form-card support-messages-card">
            <h2>2. Para qual encontrista?</h2>
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
                {availableLetters.map(letter =>
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
              {customSource && <button type="button" className="btn ghost" onClick={restoreTemplate} disabled={savingTemplate}>
                Restaurar modelo original
              </button>}
            </div>
            {customizing && <div className="support-template-customizer">
              <label htmlFor="support-template-source">Seu modelo, reutilizável para outros atendimentos</label>
              <p className="muted small">
                Use as variáveis abaixo para preencher automaticamente nomes, IDs e links. O modelo fica salvo no sistema para acesso da equipe em outros dispositivos.
                Não escreva tokens nem links privados diretamente no modelo.
              </p>
              <div className="support-template-variables">
                {SUPPORT_TEMPLATE_FIELDS.map(field => <button key={field} type="button"
                  onClick={() => setTemplateDraft(previous => previous + (previous ? ' ' : '') + field)}>
                  {field}
                </button>)}
              </div>
              <textarea id="support-template-source" className="support-template-source"
                value={templateDraft} rows={12} spellCheck
                onChange={event => setTemplateDraft(event.target.value)} />
              <div className="support-template-custom-actions">
                <button type="button" className="btn" onClick={saveTemplate} disabled={savingTemplate}>
                  {savingTemplate ? 'Salvando modelo…' : 'Salvar meu modelo'}
                </button>
                <button type="button" className="btn ghost" onClick={() => setCustomizing(false)}>
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
              O nome ainda não foi informado. A mensagem usa uma saudação genérica até você preenchê-lo.
              Você também pode usar o modelo “Qual é seu nome?”.
            </div>}
            {missingRecipients && template !== 'pedir_nome' && <p className="muted small">
              Selecione encontristas acima para acrescentar os nomes e IDs. Você já pode revisar a mensagem abaixo.
            </p>}
            {blocked && <div className="notice warning" role="alert">
              {invalidConfirm
                ? 'Para confirmar recebimento, selecione cartinha(s) com Pix confirmado e envio finalizado. A prévia pode ser editada, mas o envio permanece bloqueado.'
                : 'Selecione cartinhas realmente vazias e não finalizadas para usar este aviso. A prévia pode ser editada.'}
            </div>}
            <label htmlFor="support-editor">Mensagem editável para WhatsApp</label>
            <textarea id="support-editor" className="support-textarea" value={text} rows={18}
              placeholder="A mensagem aparece aqui. Você pode escrever, adaptar ou usar um modelo personalizado."
              onChange={event => {setText(event.target.value);setEdited(true);}}/>
            <div className="support-message-editor-tools">
              <span className="muted small">Use *negrito*, _itálico_ e emojis. As alterações aparecem na prévia.</span>
              {edited && <button type="button" className="text-button"
                onClick={() => {setText(generated);setEdited(false);}}>
                Restaurar mensagem gerada
              </button>}
            </div>
            <div className="support-message-actions">
              <button type="button" className="btn" disabled={!canSend} onClick={copyMessage}>
                <ClipboardCopy size={17}/> Copiar mensagem
              </button>
              <button type="button" className="btn outline" disabled={!canSend}
                onClick={openWhatsApp}>
                <MessageCircle size={17}/> Abrir WhatsApp
              </button>
            </div>
            {notice && <p className="notice success" role="status">{notice}</p>}
            <details className="support-preview-details" open>
              <summary>Prévia com negrito e itálico</summary>
              {text.trim() ? <WhatsAppTextPreview value={text} /> : <p className="support-message-preview">Nenhuma mensagem digitada.</p>}
            </details>
            <p className="muted small">O WhatsApp abre para revisão. <strong>O sistema não envia automaticamente.</strong> Confira o destinatário e toque em Enviar no aplicativo.</p>
          </section>
        </div>
      </div>
    </section>
  );
}

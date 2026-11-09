import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ClipboardCopy, ExternalLink, MessageCircle, RefreshCw, Trash2 } from 'lucide-react';
import { api, track } from '../lib/api';
import { normalizeBrazilianWhatsApp } from '../lib/recipientWhatsApp';
import { publishDraftOg } from '../lib/draftOg.js';
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
  const initial = location.state?.support || {};
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState(
    initial.recipient_slug ? [initial.recipient_slug] : []
  );
  const [template, setTemplate] = useState(initial.template || 'desculpas');
  const [contactName, setContactName] = useState(initial.contact_name || '');
  const [contactWhatsApp, setContactWhatsApp] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState(
    initial.order_id ? [initial.order_id] : []
  );
  const [resumeUrl, setResumeUrl] = useState(initial.resume_url || '');
  const [text, setText] = useState('');
  const [edited, setEdited] = useState(false);

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
  const blocked = missingName || missingRecipients || invalidConfirm || invalidEmpty;
  const validOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://ejc.migos.club';

  const generated = useMemo(() => {
    if (blocked) return '';
    try {
      return createSupportMessage(template, {
        contactName, recipientNames: names, recipients: people,
        orders: selectedOrders, origin: validOrigin, resumeUrl,
      });
    } catch {
      return '';
    }
  }, [template, contactName, selectedRecipients.join('|'), selectedOrderIds.join('|'),
      names.join('|'), letters, resumeUrl, validOrigin, blocked]);
  useEffect(() => { setText(generated); setEdited(false); }, [generated]);

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
  async function ensurePersonalizedDraftOg() {
    const drafts=selectedOrders.filter(order=>
      !order.submitted&&['paid','preparing','delivered'].includes(order.status));
    if(!drafts.length)return null;
    return publishDraftOg(drafts);
  }

  async function copyMessage() {
    if (blocked || !text.trim()) return;
    try {
      let ogNote='';
      try {
        const generated=await ensurePersonalizedDraftOg();
        if(generated)ogNote=' OG personalizada de '+generated.recipients.join(', ')+' publicada.';
      } catch (cause) {
        ogNote=' Não foi possível publicar a OG personalizada: '+cause.message;
      }
      await navigator.clipboard.writeText(text);
      setNotice('✅ Mensagem copiada com a formatação do WhatsApp!'+ogNote);
      track('admin_support_template_copied', { stage: template });
    } catch {
      window.prompt('Copie a mensagem:', text);
    }
  }
  async function openWhatsApp() {
    if (blocked || !text.trim()) return;
    const phone = contactWhatsApp.trim();
    const number = phone ? normalizeBrazilianWhatsApp(phone) : '';
    if (phone && !number) {
      setError('Informe um WhatsApp válido com DDD ou deixe o campo vazio para escolher o contato no aplicativo.');
      return;
    }
    // Safari requires the new tab to be opened in the user's tap gesture.
    const popup=window.open('about:blank','_blank');
    try {
      popup?.document?.write(`
      <!DOCTYPE html>
    <html>
    <head>
      <title>Popup Window</title>
      <style>
        body { font-family: sans-serif; text-align: center; padding: 20px; }
        button { padding: 10px; background: #007bff; color: white; border: none; cursor: pointer; }
      </style>
    </head>
    <body>
      <h2>Aguarde...</h2>
      <p>Preparando sua mensagem para o WhatsApp…</p>
    </body>
    </html>
      
      <p></p>`);
      const generated=await ensurePersonalizedDraftOg();
      const url=number
        ? 'https://wa.me/' + number + '?text=' + encodeURIComponent(text)
        : 'https://api.whatsapp.com/send?text=' + encodeURIComponent(text);
      setError('');
      setNotice('WhatsApp aberto. Confira a conversa e envie manualmente. '+
        (generated?'A prévia personalizada foi publicada automaticamente.':''));
      track('admin_support_template_whatsapp_opened',{stage:template});
      if(popup&&!popup.closed)popup.location.replace(url);
      else window.location.assign(url);
    } catch (cause) {
      // An image failure must not block the actual support message.
      const url=number
        ? 'https://wa.me/' + number + '?text=' + encodeURIComponent(text)
        : 'https://api.whatsapp.com/send?text=' + encodeURIComponent(text);
      setNotice('O WhatsApp será aberto, mas a prévia personalizada não pôde ser gerada.');
      setError(cause.message);
      if(popup&&!popup.closed)popup.location.replace(url);
      else window.location.assign(url);
    }
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
                <button className="btn ghost" type="button" onClick={() => setTemplate('pedir_nome')}>
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
            <small>Sem telefone cadastrado, você poderá escolher a conversa ao abrir o WhatsApp. O número não é salvo no sistema.</small>
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
              onChange={event => {setTemplate(event.target.value);setNotice('');}}>
              {[...new Set(SUPPORT_MESSAGE_TEMPLATES.map(item => item.group))].map(group =>
                <optgroup label={group} key={group}>
                  {SUPPORT_MESSAGE_TEMPLATES.filter(item => item.group===group).map(item =>
                    <option value={item.id} key={item.id}>{item.title}</option>)}
                </optgroup>)}
            </select>
            <p className="muted small">{templateInfo?.summary}</p>
            {(template==='rascunho_vazio'||template==='link_privado')&&<>
              <label htmlFor="support-resume-link">Link privado de continuação <small>(se o administrador já gerou um)</small></label>
              <input id="support-resume-link" type="url" autoComplete="off" spellCheck={false}
                value={resumeUrl} onChange={event => setResumeUrl(event.target.value)}
                placeholder="https://ejc.migos.club/pedido/…" />
              <small>Esse link é pessoal. Só inclua se tiver certeza de que a conversa é com a pessoa que enviou a cartinha. Ele não vai para o Analytics.</small>
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
            {blocked ? <div className="notice warning" role="alert">
              {missingName
                ? 'Informe o nome da pessoa para gerar a resposta. Se ainda não souber, escolha o modelo “Qual é seu nome?”.'
                : missingRecipients
                  ? 'Selecione pelo menos um encontrista antes de preparar a mensagem personalizada.'
                  : invalidConfirm
                    ? 'Não é possível confirmar recebimento antes do pagamento e envio finalizado dos pedidos selecionados.'
                    : 'Selecione somente as cartinhas que ainda estejam sem conteúdo e com envio pendente para usar este aviso.'}
            </div> : <>
              <label htmlFor="support-editor">Texto editável, com a formatação original do WhatsApp</label>
              <textarea id="support-editor" className="support-textarea" value={text} rows={18}
                onChange={event => {setText(event.target.value);setEdited(true);}}/>
              {edited && <button type="button" className="text-button"
                onClick={() => {setText(generated);setEdited(false);}}>
                Restaurar modelo com os nomes e links atuais
              </button>}
              <div className="support-message-actions">
                <button type="button" className="btn" disabled={!text.trim()} onClick={copyMessage}>
                  <ClipboardCopy size={17}/> Copiar formatada
                </button>
                <button type="button" className="btn outline" disabled={!text.trim()}
                  onClick={openWhatsApp}>
                  <MessageCircle size={17}/> Abrir WhatsApp
                </button>
              </div>
            </>}
            {notice && <p className="notice success" role="status">{notice}</p>}
            <details className="support-preview-details" open>
              <summary>Prévia com negrito e itálico</summary>
              <WhatsAppTextPreview value={text} />
            </details>
            <p className="muted small">O WhatsApp abre para revisão. <strong>O sistema não envia automaticamente.</strong> Confira o destinatário e toque em Enviar no aplicativo.</p>
          </section>
        </div>
      </div>
    </section>
  );
}

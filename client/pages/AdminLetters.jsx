import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { CheckCheck, Eye, EyeOff, LockKeyhole, RefreshCw, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { api, track } from '../lib/api';
import { readyLetterWhatsAppMessage } from '../lib/helpLink.js';
import { publishDraftOg } from '../lib/draftOg.js';
import { whatsappShareUrl } from '../lib/recipientWhatsApp.js';
import { validContactName, createSupportMessage } from '../lib/supportMessages.js';
import StickerLayer from '../components/letter/StickerLayer';
import TechnicalLetterPreview from '../components/TechnicalLetterPreview';
import TechnicalMuralPreview, { extractMuralGrant, extractMuralCode } from '../components/TechnicalMuralPreview';
import '../styles/technical-preview.css';
import '../styles/admin-bulk-finalize.css';
import { THEMES } from '../../shared/letter.js';

const paid = (status) => ['paid', 'preparing', 'delivered'].includes(status);
function createdAt(value) {
  const raw = String(value || '').trim().replace(' ', 'T');
  const normalized = /(?:Z|[+-][0-9]{2}:[0-9]{2})$/i.test(raw) ? raw : raw + 'Z';
  const date = new Date(normalized);
  return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString('pt-BR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo',
  });
}
function statusText(letter) {
  if (letter.gift) return '💛 Presente do Mini Mercado · enviada';
  if (letter.status === 'cancelled') return 'Pedido cancelado';
  if (paid(letter.status)) return letter.submitted ? 'Pago · enviada' : 'Pago · rascunho';
  return letter.submitted ? 'Pix pendente · enviada' : 'Pix pendente · rascunho';
}

// A API retorna SOMENTE remetente, metadados e adesivos. Nenhum segredo é
// enviado ao navegador do administrador, nem sequer em nós ocultos no DOM.
function SecretLetterPreview({ letter }) {
  const theme = THEMES[letter.theme] || THEMES.lilac;
  return (
    <div className="admin-secret-paper" style={{
      '--secret-paper': theme.paper,
      '--secret-edge': theme.edge,
      '--secret-ink': theme.ink,
      '--secret-accent': theme.accent,
    }}>
      <div className="admin-secret-paper-head">
        <span>✳ XX EJC SIMONÉSIA ✳</span>
        <h3>Para {letter.recipient_name} ♡</h3>
        <div className="admin-secret-sender">
          Enviada por <strong>{letter.sender_name}</strong>
        </div>
      </div>
      <div className="admin-secret-hidden" aria-label="Conteúdo da mensagem privado e indisponível à coordenação">
        <div className="admin-secret-blur" aria-hidden="true">
          <span /><span /><span /><span /><span />
          <div className="admin-secret-image-shapes"><i /><i /></div>
        </div>
        <div className="admin-secret-lock">
          <LockKeyhole size={24} />
          <strong>Conteúdo secreto</strong>
          <span>Somente o encontrista poderá ler, ver fotos e ouvir áudios.</span>
        </div>
      </div>
      {letter.stickers.length > 0 ? (
        <div className="admin-secret-stickers">
          <span className="eyebrow"><Sparkles size={15} /> Adesivos visíveis</span>
          <StickerLayer composition={{ stickers: letter.stickers }} />
        </div>
      ) : <p className="muted small admin-secret-stickers-empty">Nenhum sticker nesta cartinha.</p>}
      <p className="admin-secret-footer"><ShieldCheck size={16} />
        Esta prévia não revela texto, imagens, áudio nem links de acesso.
      </p>
    </div>
  );
}

function ResumeDraftLink({ letter }) {
  const [recovery, setRecovery] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const recipient = letter.sender_name || 'remetente';
  const [contactName, setContactName] = useState(validContactName(letter.sender_name) ? letter.sender_name : '');
  const shareText = recovery && validContactName(contactName)
    ? createSupportMessage('rascunho_vazio', {
      contactName, recipientNames: [letter.recipient_name],
      recipients: [{ name:letter.recipient_name, slug:letter.recipient_slug }],
      orders: [{ id:letter.id, recipient_name:letter.recipient_name }],
      resumeUrl: recovery.resume_url, origin: window.location.origin,
    })
    : '';

  async function createLink() {
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const response = await api('/api/admin/cartinhas/' + encodeURIComponent(letter.id) + '/resume-link', {
        method: 'POST', data: {},
      });
      // PNG is rendered with the real recipient name and published automatically
      // before a recoverable link is copied or shared. No manual image editing.
      let ogWarning='';
      try {
        await publishDraftOg([{id:letter.id,recipient_name:letter.recipient_name}]);
      } catch (cause) {
        ogWarning='O link funciona, mas a prévia personalizada não pôde ser gerada: '+cause.message;
      }
      const tracked=new URL(response.resume_url);
      tracked.searchParams.set('utm_source','whatsapp');
      tracked.searchParams.set('utm_medium','mensagem');
      tracked.searchParams.set('utm_campaign','recuperacao_cartinha');
      tracked.searchParams.set('utm_content','rascunho_pago');
      setRecovery({...response,resume_url:tracked.toString()});
      if(ogWarning)setError(ogWarning);
    } catch (cause) {
      setError(cause.message || 'Não foi possível criar o link.');
    } finally {
      setBusy(false);
    }
  }

  async function copyMessage() {
    if (!shareText) {
      setError('Informe o nome de quem entrou em contato antes de enviar a mensagem.');
      return;
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
    } catch {
      window.prompt('Copie a mensagem e o link de continuação:', shareText);
    }
  }

  return (
    <div className="admin-draft-recovery">
      <p><strong>⚠️ Sem conteúdo salvo no servidor.</strong> O pagamento foi confirmado,
        mas ainda não há texto, foto ou áudio finalizado para aprovar.</p>
      {!validContactName(contactName) && <div className="field">
        <label htmlFor={'draft-contact-'+letter.id}>Como se chama a pessoa que entrou em contato?</label>
        <input id={'draft-contact-'+letter.id} value={contactName} maxLength={100}
          onChange={event => setContactName(event.target.value)} placeholder="Nome da pessoa" />
        <small>O nome não foi informado no rascunho. Peça-o antes de responder.</small>
      </div>}
      {!recovery ? (
        <button type="button" className="btn outline" disabled={busy} onClick={createLink}>
          <LockKeyhole size={16} /> {busy ? 'Criando link…' : 'Criar link para ' + recipient + ' continuar'}
        </button>
      ) : (
        <div className="admin-draft-recovery-link">
          <p>Link privado de <strong>{recovery.sender_name}</strong>, válido por 14 dias.
            Envie diretamente ao remetente. O link original continua funcionando.</p>
          <a href={recovery.resume_url} target="_blank" rel="noopener noreferrer">
            {recovery.resume_url}
          </a>
          <div className="inline-actions">
            <button type="button" className="btn" onClick={copyMessage} disabled={!shareText}>
              {copied ? '✓ Mensagem copiada' : 'Copiar mensagem e link'}
            </button>
            <button type="button" className="btn ghost" onClick={createLink} disabled={busy}>
              <RefreshCw size={15} /> Renovar validade
            </button>
          </div>
        </div>
      )}
      <Link className="btn outline" to="/admin/mensagens" state={{ support: {
        template:'rascunho_vazio',recipient_slug:letter.recipient_slug,
        order_id:letter.id,contact_name:contactName,
        resume_url:recovery?.resume_url||''
      }}}>💌 Personalizar no editor de mensagens</Link>
      {error && <p className="notice error" role="alert">{error}</p>}
    </div>
  );
}

function RecoveredLetterNotice({letter,onUpdated}){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [whatsApp,setWhatsApp]=useState('');
  const [confirming,setConfirming]=useState(false);
  async function prepare(){
    // Keep a tab open through the async API call on mobile Safari.
    const popup=window.open('about:blank','_blank');
    if(popup){try{popup.opener=null;popup.document.body.textContent='Preparando WhatsApp…';}catch{}}
    setBusy(true);setError('');setWhatsApp('');
    try{
      const data=await api('/api/admin/cartinhas/'+encodeURIComponent(letter.id)+'/ready-whatsapp',
        {method:'POST',data:{}});
      const message=readyLetterWhatsAppMessage(data);
      const url=whatsappShareUrl({phone:data.phone,message});
      track('admin_recovered_notice_opened',{stage:'whatsapp'});
      setWhatsApp(url);
      setConfirming(true);
      if(popup&&!popup.closed)popup.location.replace(url);
    }catch(cause){
      try{popup?.close();}catch{}
      setError(cause.message||'Não foi possível gerar o convite.');
    }finally{setBusy(false);}
  }
  async function confirmSent(){
    setBusy(true);setError('');
    try{
      await api('/api/admin/cartinhas/'+encodeURIComponent(letter.id)+'/ready-whatsapp/confirm',
        {method:'POST',data:{}});
      track('admin_recovered_notice_confirmed',{stage:'whatsapp'});
      setConfirming(false);
      await onUpdated();
    }catch(cause){setError(cause.message||'Não foi possível salvar a confirmação.');}
    finally{setBusy(false);}
  }
  return <section className="notice success" aria-label="Cartinha recuperada">
    <p><strong>✅ Rascunho vazio recuperado!</strong>{letter.submitted
      ?' Esta cartinha já foi enviada e está pronta para o encontrista.'
      :' Já tem conteúdo no servidor. Falta finalizar o envio antes de avisar.'}</p>
    {letter.submitted&&<div className="inline-actions">
      <button type="button" className="btn" disabled={busy} onClick={prepare}>
        {busy?'Preparando…':letter.recipient_notified_at?'📲 Aviso enviado · reenviar':'📲 Avisar encontrista no WhatsApp'}
      </button>
      {whatsApp&&<a href={whatsApp} target="_blank" rel="noopener noreferrer"
        onClick={()=>track('admin_recovered_notice_link_clicked',{stage:'whatsapp'})}
        className="btn outline">Abrir link do WhatsApp</a>}
    </div>}
    {confirming&&<div className="notice">
      <strong>Você realmente enviou o aviso no WhatsApp?</strong>
      <p>Abrir a conversa não significa que a mensagem foi enviada.</p>
      <div className="inline-actions">
        <button type="button" className="btn" disabled={busy} onClick={confirmSent}>Sim, enviei</button>
        <button type="button" className="btn ghost" onClick={()=>setConfirming(false)}>Ainda não</button>
      </div>
    </div>}
    {letter.recipient_notified_at&&<small>✅ Envio confirmado manualmente em {createdAt(letter.recipient_notified_at)}</small>}
    {error&&<p className="notice error" role="alert">{error}</p>}
  </section>;
}

export default function AdminLetters() {
  const { slug } = useParams();
  const location = useLocation();
  const technicalMode = new URLSearchParams(location.search).get('secret') === '000000';
  const [technicalInput, setTechnicalInput] = useState('');
  const [technicalPassword, setTechnicalPassword] = useState('');
  const [muralRecipient, setMuralRecipient] = useState('');
  const [muralTokenInput, setMuralTokenInput] = useState('');
  const [muralSelection, setMuralSelection] = useState(null);
  const [muralError, setMuralError] = useState('');
  useEffect(() => {
    if (!technicalMode) {
      setTechnicalPassword('');
      setTechnicalInput('');
      setMuralSelection(null);
      setMuralTokenInput('');
      setMuralError('');
    }
  }, [technicalMode]);
  const [letters, setLetters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState({});
  const [finalizeSummary, setFinalizeSummary] = useState(null);
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [finalizeProgress, setFinalizeProgress] = useState('');
  const [finalizeError, setFinalizeError] = useState('');
  const [finalizeResult, setFinalizeResult] = useState('');
  const updateFinalizeSummary = useCallback(async () => {
    if (slug) return;
    try {
      const summary=await api('/api/admin/cartinhas/finalize-preview');
      setFinalizeSummary(summary);
    } catch (cause) {
      setFinalizeError(cause.message);
    }
  }, [slug]);

  const finalizePaid = async () => {
    if (finalizeBusy || !finalizeSummary?.eligible) return;
    const accepted=window.confirm(
      'Finalizar ' + finalizeSummary.eligible + ' cartinha(s) PAGAS com conteúdo salvo?\n\n' +
      'Outras ' + finalizeSummary.empty + ' cartinhas pagas estão vazias e serão ignoradas.\n\n' +
      'Ao finalizar, as cartinhas ficarão disponíveis no mural privado assim que chegar o horário de liberação. ' +
      'A coordenação não terá acesso a textos, fotos ou áudios.'
    );
    if (!accepted) return;
    setFinalizeBusy(true);setFinalizeError('');setFinalizeResult('');
    let cursor='',finalized=0,empty=0,failed=0,notificationFailed=0,scanned=0;
    const failures=[];
    try {
      const seen=new Set();
      for (;;) {
        if(seen.has(cursor))throw new Error('A paginação não avançou. Confira as cartinhas restantes.');
        seen.add(cursor);
        const page=await api('/api/admin/cartinhas/finalize-paid',{
          method:'POST',data:{cursor},
        });
        finalized+=page.finalized||0;
        empty+=page.empty||0;
        failed+=page.failed||0;
        notificationFailed+=page.notification_failed||0;
        scanned+=page.scanned||0;
        failures.push(...(page.failed_ids||[]));
        setFinalizeProgress('Conferidas ' + scanned + ' cartinhas · ' + finalized + ' finalizadas…');
        if(!page.next_cursor)break;
        cursor=page.next_cursor;
      }
      setFinalizeResult(finalized + ' cartinha(s) finalizada(s). ' +
        empty + ' sem conteúdo foram ignoradas. ' +
        (failed ? failed + ' erro(s) na finalização: ' + failures.join(', ') : 'Tudo concluído!') +
        (notificationFailed ? ' Atenção: ' + notificationFailed + ' aviso(s) precisam ser verificados.' : ''));
    } catch (cause) {
      setFinalizeError('Processo interrompido após ' + finalized +
        ' finalizações: ' + cause.message + '. As já finalizadas foram preservadas.');
    } finally {
      setFinalizeBusy(false);setFinalizeProgress('');
      await Promise.all([refresh(),updateFinalizeSummary()]);
    }
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api('/api/admin/cartinhas');
      setLetters(response.letters || []);
      setError('');
    } catch (cause) { setError(cause.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); updateFinalizeSummary(); }, [refresh, updateFinalizeSummary]);
  const selected = slug ? letters.find((letter) => letter.recipient_slug === slug) : null;
  const rows = useMemo(() => letters.filter((letter) => {
    if (slug && letter.recipient_slug !== slug) return false;
    if (filter === 'pending' && paid(letter.status)) return false;
    if (filter === 'paid' && !paid(letter.status)) return false;
    if (filter === 'draft' && letter.submitted) return false;
    if (filter === 'paid-draft' && (!paid(letter.status) || letter.submitted || letter.gift)) return false;
    if (filter === 'empty-paid-draft' && (!paid(letter.status) || letter.submitted || letter.gift || letter.has_content)) return false;
    if (filter === 'sent' && !letter.submitted) return false;
    if (filter === 'recovered' && !letter.recovered_at) return false;
    if (filter === 'ready-notify' && (!letter.recovered_at||!letter.submitted||letter.recipient_notified_at))return false;
    const query = search.trim().toLocaleLowerCase('pt-BR');
    return !query || [letter.recipient_name, letter.sender_name, letter.id]
      .some((text) => String(text).toLocaleLowerCase('pt-BR').includes(query));
  }), [letters, slug, search, filter]);
  const heading = slug ? 'Cartinhas de ' + (selected?.recipient_name || 'encontrista') : 'Todas as cartinhas';
  const recipients = useMemo(() => Array.from(new Map(letters.map(letter => [letter.recipient_slug, letter.recipient_name])).entries()).sort((a,b) => a[1].localeCompare(b[1], 'pt-BR')), [letters]);
  function openRecipientMural(event) {
    event.preventDefault();
    setMuralError('');
    const raw=muralTokenInput.trim();
    const grant=raw ? extractMuralGrant(raw) : '';
    const code=raw ? extractMuralCode(raw) : '';
    if(raw && !grant && !code){ setMuralError('Cole o código pessoal de seis caracteres, um token m2. ou o link do mural.'); return; }
    const recipientSlug=slug || muralRecipient || recipients[0]?.[0];
    if(!grant && !code && !recipientSlug){setMuralError('Selecione um encontrista ou cole o token do mural.');return;}
    setMuralSelection({recipientSlug:grant || code ? '' : recipientSlug,userToken:grant,userCode:code});
    setMuralTokenInput('');
  }

  return (
    <div className="admin-letters-page">
      <div className="section-head">
        <div>
          <span className="eyebrow">COORDENAÇÃO / ACESSO RESTRITO</span>
          <h1>{heading}</h1>
          <p>Veja todas as homenagens, inclusive as que ainda aguardam Pix. O conteúdo permanece inacessível à coordenação.</p>
        </div>
        <button type="button" className="btn ghost" disabled={loading} onClick={refresh}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>
      {slug && <Link className="text-button" to={'/admin/cartinhas' + (technicalMode ? '?secret=000000' : '')}>← Ver todas as cartinhas</Link>}
      {!slug && <section className="admin-bulk-finalize form-card">
        <div>
          <span className="eyebrow">CARTINHAS PAGAS · ENVIO EM LOTE</span>
          <h2><CheckCheck size={22} /> Finalizar cartinhas pagas</h2>
          <p>Cartinhas com Pix confirmado e mensagem, foto ou áudio já salvos podem ser concluídas em massa.
            O conteúdo permanece privado e as cartinhas vazias são ignoradas.</p>
        </div>
        {finalizeSummary && <div className="admin-bulk-finalize-counts" role="status">
          <span><strong>{finalizeSummary.paid_drafts}</strong> rascunhos pagos</span>
          <span><strong>{finalizeSummary.eligible}</strong> com conteúdo salvo</span>
          <span><strong>{finalizeSummary.empty}</strong> sem conteúdo</span>
        </div>}
        <div className="admin-bulk-finalize-actions">
          <button type="button" className="btn" disabled={finalizeBusy||!finalizeSummary?.eligible}
            onClick={finalizePaid}>
            <CheckCheck size={17} /> {finalizeBusy?'Finalizando…':'Finalizar ' + (finalizeSummary?.eligible||0) + ' cartinha(s) pagas'}
          </button>
          <button type="button" className="btn outline" disabled={finalizeBusy}
            onClick={() => { setFinalizeError(''); updateFinalizeSummary(); }}><RefreshCw size={16} /> Recontar</button>
        </div>
        {finalizeProgress && <p role="status" className="notice">{finalizeProgress}</p>}
        {finalizeResult && <p role="status" className="notice success">{finalizeResult}</p>}
        {finalizeError && <p role="alert" className="notice error">{finalizeError}</p>}
        <small>O envio continua dependendo de pagamento confirmado. Nada é finalizado automaticamente ao abrir esta página.</small>
      </section>}
      {technicalMode && (
        <form className="admin-tech-gate" onSubmit={(event) => {
          event.preventDefault();
          setTechnicalPassword(technicalInput);
          setTechnicalInput('');
          setMuralSelection(null);
        }}>
          <strong>🔐 Modo de conferência técnica de layout</strong>
          <p>Somente para o responsável técnico. O parâmetro da URL não concede acesso: além do login administrativo, é necessária a credencial técnica separada configurada no servidor. A coordenação continua vendo apenas a prévia protegida.</p>
          {technicalPassword ? <div className="notice success">Credencial técnica informada para esta sessão. A verificação acontece no servidor ao abrir cada cartinha.</div> : null}
          <div className="admin-tech-entry">
            <label>Credencial técnica
              <input type="password" minLength={20} maxLength={256} autoComplete="off"
                placeholder="Senha técnica, não é 000000" value={technicalInput}
                onChange={(event) => setTechnicalInput(event.target.value)} />
            </label>
            <button type="submit" className="btn" disabled={technicalInput.length < 20}>
              <LockKeyhole size={16} /> Ativar conferência
            </button>
            {technicalPassword && <button type="button" className="btn outline" onClick={() => {
              setTechnicalPassword('');
              setExpanded({});
              setMuralSelection(null);
              setMuralTokenInput('');
            }}>Bloquear</button>}
          </div>
        </form>
      )}
      {technicalMode && technicalPassword && (
        <section className="admin-tech-mural-pick">
          <div>
            <strong>👁 Ver mural como encontrista</strong>
            <p>Abra todas as cartinhas no mesmo layout que o encontrista vê. O token pessoal serve para identificar o mural, não substitui sua senha técnica.</p>
          </div>
          <form className="admin-tech-mural-form" onSubmit={openRecipientMural}>
            <label>Encontrista
              <select value={slug || muralRecipient || recipients[0]?.[0] || ''}
                onChange={(event) => { setMuralRecipient(event.target.value); setMuralError(''); }}
                disabled={!!slug}>
                {recipients.map(([value,name]) => <option key={value} value={value}>{name}</option>)}
              </select>
            </label>
            <label>Código, token ou link do mural do usuário (opcional)
              <input type="password" autoComplete="off" spellCheck={false}
                placeholder="ABC234, m2.… ou link com #token=…"
                value={muralTokenInput} onChange={(event) => setMuralTokenInput(event.target.value.slice(0,1200))} />
            </label>
            <button type="submit" className="btn"><Eye size={17} /> Abrir visão do encontrista</button>
          </form>
          {muralError && <div className="notice error" role="alert">{muralError}</div>}
          {muralSelection && <TechnicalMuralPreview
            password={technicalPassword}
            recipientSlug={muralSelection.recipientSlug}
            userToken={muralSelection.userToken}
            userCode={muralSelection.userCode}
            onClose={() => setMuralSelection(null)} />}
        </section>
      )}
      <div className="notice admin-letters-privacy">
        <LockKeyhole size={18}/>
        Para revisar uma cartinha paga que ficou como rascunho: abra esta página com
        ?secret=000000, informe a credencial técnica separada, filtre “Pagos que ainda são rascunhos”,
        abra a prévia completa e escolha “Revisei o conteúdo · aprovar e enviar”.
        A coordenação comum não recebe textos ou anexos.
      </div>
      <div className="notice admin-letters-privacy">
        <ShieldCheck size={20} />
        {technicalMode && technicalPassword
          ? 'A lista administrativa continua protegida. Apenas uma prévia técnica aberta com autorização específica carrega seu conteúdo, sem alterar a privacidade para a coordenação.'
          : 'Somente o nome do remetente, os stickers e os dados operacionais são enviados para esta página. O blur é ilustrativo, não contém mensagens escondidas.'}
      </div>
      <div className="admin-letters-toolbar">
        <label className="search-box">
          <Search size={18} />
          <input type="search" aria-label="Buscar cartinhas por remetente, encontrista ou pedido"
            placeholder="Buscar remetente ou encontrista..." value={search}
            onChange={(event) => setSearch(event.target.value)} />
        </label>
        <select aria-label="Filtrar cartinhas" value={filter}
          onChange={(event) => setFilter(event.target.value)}>
          <option value="all">Todas as situações</option>
          <option value="pending">Pix pendente</option>
          <option value="paid">Pagas</option>
          <option value="sent">Enviadas</option>
          <option value="recovered">✅ Cartinhas vazias recuperadas</option>
          <option value="ready-notify">📲 Recuperadas prontas para avisar</option>
          <option value="draft">Rascunhos</option>
          <option value="paid-draft">Pagos que ainda são rascunhos</option>
          <option value="empty-paid-draft">Pagos sem conteúdo salvo</option>
        </select>
        <strong aria-live="polite">{rows.length} cartinha(s)</strong>
      </div>
      {loading && <div className="loading">Carregando cartinhas...</div>}
      {error && <div className="notice error" role="alert">{error}</div>}
      {!loading && !error && !rows.length && (
        <div className="empty">Nenhuma cartinha encontrada com esses filtros.</div>
      )}
      <div className="admin-letters-list">
        {!loading && !error && rows.map((letter) => (
          <article className="admin-letter-entry form-card" key={letter.id}>
            <div className="admin-letter-summary">
              <div>
                {!slug && <Link to={'/admin/cartinhas/' + encodeURIComponent(letter.recipient_slug) + (technicalMode ? '?secret=000000' : '')}
                  className="admin-letter-recipient">{letter.recipient_name}</Link>}
                {slug && <strong className="admin-letter-recipient">{letter.recipient_name}</strong>}
                <p>De: <strong>{letter.sender_name}</strong></p>
                <small>{letter.id} · {createdAt(letter.created_at)}</small>
                {letter.recovered_at&&<p className="admin-letter-content-status">
                  💚 Recuperada em {createdAt(letter.recovered_at)}
                </p>}
                {paid(letter.status) && !letter.submitted && !letter.gift && (
                  <p className="admin-letter-content-status">
                    {letter.has_content ? '✅ Mensagem ou anexo salvo · pronta para revisão'
                      : '⚠️ Rascunho vazio no servidor'}
                  </p>
                )}
              </div>
              <div className="admin-letter-summary-actions">
                <span className={'admin-letter-status ' + (paid(letter.status) ? 'is-paid' : 'is-pending')}>
                  {statusText(letter)}
                </span>
                <Link className="btn ghost" to="/admin/mensagens" state={{support:{
                  template:letter.submitted?'recebida':!letter.has_content?'rascunho_vazio':'aguardando',
                  recipient_slug:letter.recipient_slug, order_id:letter.id,
                  contact_name:validContactName(letter.sender_name)?letter.sender_name:''
                }}}>💬 Responder</Link>
                <button type="button" className="btn outline" aria-expanded={!!expanded[letter.id]}
                  onClick={() => setExpanded((previous) => ({
                    ...previous, [letter.id]: !previous[letter.id],
                  }))}>
                  {expanded[letter.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                  {expanded[letter.id] ? 'Fechar prévia' : 'Ver cartinha completa'}
                </button>
              </div>
            </div>
            {expanded[letter.id] && (
              <TechnicalLetterPreview
                orderId={letter.id}
                adminSession={!technicalMode || !technicalPassword}
                password={technicalMode && technicalPassword ? technicalPassword : undefined}
                allowFinalize={paid(letter.status) && !letter.submitted && !letter.gift}
                onFinalized={() => Promise.all([refresh(), updateFinalizeSummary()])}
              />
            )}
            {letter.recovered_at&&!letter.gift&&
              <RecoveredLetterNotice letter={letter} onUpdated={refresh}/>}
            {paid(letter.status) && !letter.submitted && !letter.gift && !letter.has_content && (
              <ResumeDraftLink letter={letter} />
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

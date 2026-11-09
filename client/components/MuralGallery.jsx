import React from 'react';
import { Link } from 'react-router-dom';
import { Download, LockKeyhole, Sparkles, MailOpen, LoaderCircle } from 'lucide-react';
import { LetterCard } from './LetterCard';
import UnfinishedLetterNotice from './UnfinishedLetterNotice';

// Shared recipient layout: the user portal and the technical preview render the same UI.
export default function MuralGallery({ data, opened = {}, openBusy = '', error = '', busy = false,
  onOpenLetter, onDownloadAll, onRefresh, technical = false, technicalAll = true }) {
  const openLetter = onOpenLetter;
  const downloadAll = onDownloadAll;
  const availableToDownload = (data?.cards || []).some(
    (card) => !card.draft_pending && !card.empty_content,
  );
  return (
    <div className="mural-page">
      <div className="mural-intro">
        {data?.recipient?.photo_url &&
          <img className="mural-portrait" src={data.recipient.photo_url}
            alt={`Foto de ${data.recipient.name}`} />}
        <div className="hero-kicker"><LockKeyhole size={16} /> ESTE É UM ESPAÇO SECRETO</div>
        <h1>{data?.recipient?.name ? `O mural de ${data.recipient.name}` : 'Um cantinho só seu.'} <em>♡</em></h1>
        <p>Uma coleção de palavras, memórias, fotos e vozes que alguém guardou especialmente para você.</p>
      </div>
      {error && (
        <div className="form-card" role="alert">
          <h2>Não foi possível abrir a cartinha 🔐</h2><p>{error}</p>
          {!technical && <Link to="/abrir" className="btn">Digitar meu código</Link>}
        </div>
      )}
      {data && (
        <>
          {technical && <div className="notice warning"><LockKeyhole size={17} /> {technicalAll ? 'Visualização técnica do mural. Cartinhas pendentes também aparecem para conferência e ainda não estão liberadas ao encontrista.' : 'Comparação técnica: exibindo somente as cartinhas já disponíveis ao encontrista, sem registrar leitura.'}</div>}
          <div className="mural-count">
            <Sparkles size={18} /> {data.cards.length} {data.cards.length === 1 ? 'cartinha especial' : 'cartinhas especiais'} para você
          </div>
          {data.locked && <div className="notice warning">
{technical ? 'O mural do encontrista ainda está bloqueado. Esta visualização é exclusivamente técnica.' : 'O mural abre no horário de liberação configurado. A coordenação não lê nem escuta as homenagens.'}
          </div>}
          {!data.cards.length ? (
            <div className="empty"><h2>O carinho está a caminho. 💌</h2>
              <p>As mensagens enviadas aparecerão automaticamente no horário de liberação do encontro.</p>
            </div>
          ) : (
            <>
              <div className="mural-cards">
                {data.cards.map((envelope, index) => (
                  <div key={envelope.id} className="mural-envelope">
                    {technical && !envelope.visible_to_recipient && <p className="notice warning small">Somente prévia técnica: {envelope.status === "pending" || envelope.status === "claimed" ? "Pix não confirmado" : envelope.status === "cancelled" ? "Cancelada" : !envelope.submitted ? "Ainda em rascunho" : "Mural ainda não liberado"}</p>}
                    {!technical && (envelope.draft_pending || envelope.empty_content) ? (
                      <UnfinishedLetterNotice senderName={envelope.sender_name} onRefresh={onRefresh} />
                    ) : opened[envelope.id] ? (
                      <LetterCard letter={opened[envelope.id]} recipient={data.recipient.name} actions={!technical} />
                    ) : (
                      <button type="button" className="mural-envelope-button"
                        disabled={!!openBusy} onClick={() => openLetter(envelope.id)}>
                        {openBusy === envelope.id ? <LoaderCircle size={28} /> : <MailOpen size={31} />}
                        <strong>Uma cartinha só para você ♡</strong>
                        <span>Homenagem {index + 1} · Toque para abrir e ler</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {!technical && availableToDownload && <button className="btn outline wide" disabled={busy || !!openBusy} onClick={downloadAll}>
                <Download size={18} /> {busy ? 'Montando arquivos...' : 'Baixar todas as cartinhas em ZIP'}
              </button>}
            </>
          )}
          <p className="muted small center spaced">
            {technical ? "Conferência técnica em modo somente leitura, sem registrar abertura ou acionar notificações." : "Seu código é pessoal. Não compartilhe fotos da etiqueta ou o link privado."}
          </p>
        </>
      )}
    </div>
  );

}

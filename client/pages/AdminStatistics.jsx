import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, BarChart3, CalendarDays, Download, FileText, HeartHandshake,
  Image as ImageIcon, MessageCircle, Printer, RefreshCw, ShieldCheck,
  TrendingUp, UsersRound, Wallet
} from 'lucide-react';
import { api, download, money } from '../lib/api';
import '../styles/admin-statistics.css';

const number = value => new Intl.NumberFormat('pt-BR').format(Number(value || 0));
const percent = (part, total) => total ? (100 * part / total).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '0%';
const byteSize = value => value >= 1048576 ? (value / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB' :
  (value / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' KB';
const displayDate = day => day ? day.split('-').reverse().join('/') : 'início';
const campaignName = key => ({ mural: 'Convite do mural', 'pos-encontro': 'Carta do Mini Mercado' }[key] || key);
const labelEvent = kind => ({
  payment_confirmed: 'Pix confirmado',
  first_read: 'Primeira leitura',
  letter_submitted: 'Cartinha enviada',
  letter_released: 'Cartinha liberada'
}[kind] || kind.replaceAll('_', ' '));

function todayInBrazil() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return [byType.year, byType.month, byType.day].join('-');
}
function periodParams(preset, first, last) {
  if (preset === 'custom') return { from: first, to: last };
  if (preset === 'all') return { from: '', to: '' };
  const to = todayInBrazil();
  const date = new Date(to + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - (Number(preset) - 1));
  return { from: date.toISOString().slice(0, 10), to };
}
function Metric({ icon: Icon, name, value, context, tone = '' }) {
  return <div className={'ejc-stat-metric ' + tone}>
    <div className="ejc-stat-metric-top"><span>{name}</span><Icon size={18} aria-hidden="true" /></div>
    <strong>{value}</strong>
    <small>{context}</small>
  </div>;
}
function Section({ eyebrow, title, description, children, className = '' }) {
  return <section className={'ejc-stat-section ' + className}>
    <div className="ejc-stat-section-head">
      <span className="ejc-stat-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
    {children}
  </section>;
}
function Ratio({ label, value, total, subtitle, color = 'pink' }) {
  return <div className="ejc-stat-ratio">
    <div className="ejc-stat-ratio-label"><span>{label}</span><b>{number(value)} <small>({percent(value, total)})</small></b></div>
    <div className="ejc-stat-ratio-track" role="img" aria-label={label + ': ' + percent(value, total)}>
      <div className={'ejc-stat-ratio-fill ' + color} style={{ width: Math.min(100, total ? value / total * 100 : 0) + '%' }} />
    </div>
    {subtitle && <small>{subtitle}</small>}
  </div>;
}
function MoneyTrend({ rows }) {
  if (!rows.length) return <p className="ejc-stat-empty">Ainda não há registros neste período.</p>;
  const values = rows.map(row => row.revenue_cents / 100);
  const maximum = Math.max(1, ...values);
  const point = (value, index) => [
    42 + index * 668 / Math.max(rows.length - 1, 1),
    175 - value / maximum * 137
  ];
  const path = values.map((value, index) => {
    const [x, y] = point(value, index);
    return (index ? 'L' : 'M') + x.toFixed(2) + ',' + y.toFixed(2);
  }).join(' ');
  const [firstX] = point(values[0], 0);
  const [lastX] = point(values[values.length - 1], values.length - 1);
  return <div className="ejc-stat-trend">
    <svg viewBox="0 0 760 235" role="img" aria-label="Gráfico de receita Pix confirmada por dia">
      <defs><linearGradient id="ejc-stat-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ee5b89" stopOpacity=".27" /><stop offset="1" stopColor="#ee5b89" stopOpacity="0" />
      </linearGradient></defs>
      {[0, 0.25, 0.5, 0.75, 1].map(factor =>
        <g key={factor}>
          <line x1="42" y1={175 - factor * 137} x2="710" y2={175 - factor * 137}
            stroke="#e9e6ea" strokeDasharray="4 5" />
          <text x="35" y={179 - factor * 137} textAnchor="end" fontSize="11" fill="#706b75">
            {number(Math.round(maximum * factor))}
          </text>
        </g>)}
      <path d={path + ' L' + lastX + ',175 L' + firstX + ',175 Z'} fill="url(#ejc-stat-grad)" />
      <path d={path} stroke="#dd467b" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {rows.map((row, index) => {
        const [x, y] = point(values[index], index);
        return <circle key={row.day} cx={x} cy={y} r="3.5" fill="#dd467b">
          <title>{displayDate(row.day) + ': ' + money(row.revenue_cents)}</title>
        </circle>;
      })}
      {[0, Math.floor((rows.length - 1) / 2), rows.length - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => {
        const [x] = point(values[i], i);
        return <text key={i} x={x} y="203" textAnchor="middle" fontSize="12" fill="#6e6571">{displayDate(rows[i].day)}</text>;
      })}
    </svg>
  </div>;
}
function HourDistribution({ rows }) {
  const counts = Array.from({ length: 24 }, (_, hour) => {
    const record = rows.find(row => Number(row.hour) === hour);
    return { hour, count: record ? record.purchases : 0 };
  });
  const top = Math.max(1, ...counts.map(row => row.count));
  return <div className="ejc-stat-hours" role="img" aria-label="Distribuição dos pedidos por hora de Brasília">
    {counts.map(({ hour, count }) => <div key={hour} className="ejc-stat-hour">
      <div title={String(hour).padStart(2, '0') + 'h: ' + number(count) + ' compra(s)'}
        style={{ height: (count ? Math.max(4, count / top * 100) : 2) + '%' }} />
      <small>{hour % 4 === 0 ? String(hour).padStart(2, '0') + 'h' : ''}</small>
    </div>)}
  </div>;
}
function exportCsv(stats) {
  const rows = [['Seção', 'Indicador', 'Valor', 'Complemento']];
  const add = (section, label, value, complement = '') => rows.push([section, label, value, complement]);
  add('Relatório', 'Gerado em', stats.generated_at);
  add('Relatório', 'Período inicial', stats.period.from || 'Todo o histórico');
  add('Relatório', 'Período final', stats.period.to || 'Todo o histórico');
  for (const [key, value] of Object.entries(stats.payments)) add('Financeiro', key, value);
  for (const [key, value] of Object.entries(stats.letters)) add('Cartinhas', key, value);
  for (const [key, value] of Object.entries(stats.recipients.overview)) add('Encontristas', key, value);
  for (const [key, value] of Object.entries(stats.recovery)) add('Rascunhos', key, value);
  for (const row of stats.recipients.ranking)
    add('Por encontrista', row.name, row.received, 'Pagas: ' + row.paid + '; criadas: ' + row.letters + '; lidas: ' + row.read_count);
  for (const row of stats.daily)
    add('Por dia', row.day, row.revenue_cents, 'Compras: ' + row.purchases + '; cartinhas: ' + row.letters + '; enviadas: ' + row.submitted);
  for (const row of stats.media) add('Mídias', row.kind, row.files, 'Bytes: ' + row.bytes);
  for (const row of stats.campaigns) add('Campanhas', row.campaign, row.published, 'Criadas: ' + row.letters);
  for (const row of stats.whatsapp) add('WhatsApp manual', row.campaign, row.recipients, 'Envios marcados: ' + row.sends);
  for (const row of stats.help) add('Links de ajuda', row.campaign, row.clicks);
  for (const row of stats.notifications) add('Notificações', row.kind, row.sent, 'Fila: ' + row.queued);
  // Protect spreadsheet applications against formula injection from recipient names.
  const cell = value => {
    const raw = String(value ?? '');
    const safe = /^[=+\-@\t\r]/.test(raw) ? "'" + raw : raw;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const csv = '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n');
  download(csv, 'ejc-estatisticas-' + todayInBrazil() + '.csv', 'text/csv;charset=utf-8');
}

export default function AdminStatistics() {
  const [preset, setPreset] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const period = useMemo(() => periodParams(preset, from, to), [preset, from, to]);
  const query = new URLSearchParams();
  if (period.from) query.set('from', period.from);
  if (period.to) query.set('to', period.to);
  const filter = query.toString();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api('/api/admin/statistics' + (filter ? '?' + filter : ''), { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setReport(data); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter, refresh]);
  const p = report?.payments || {}, l = report?.letters || {}, r = report?.recipients || {};
  const people = r.ranking || [];
  const covered = people.filter(person => person.active && person.received > 0).length;
  const withPaid = people.filter(person => person.active && person.paid > 0).length;
  const showReport = !!report && !loading && !error;

  return <div className="ejc-stat-report">
    <div className="ejc-stat-toolbar no-print">
      <div>
        <span className="eyebrow">ADMIN / VISÃO GERAL</span>
        <h1>Estatísticas do EJC <span aria-hidden="true">📊</span></h1>
        <p>Resultados reais das cartinhas, pagamentos e entregas, com relatório pronto para A4.</p>
      </div>
      <div className="ejc-stat-actions">
        <button className="btn ghost" type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'ejc-stat-spin' : ''} /> Atualizar
        </button>
        <button className="btn ghost" type="button" onClick={() => report && exportCsv(report)} disabled={!showReport}>
          <Download size={16} /> CSV
        </button>
        <button className="btn" type="button" onClick={() => window.print()} disabled={!showReport}>
          <Printer size={16} /> Imprimir / PDF
        </button>
      </div>
    </div>
    <div className="ejc-stat-filters no-print">
      <label htmlFor="ejc-stat-period"><CalendarDays size={16} /> Período</label>
      <select id="ejc-stat-period" value={preset} onChange={event => setPreset(event.target.value)}>
        <option value="all">Todo o histórico</option>
        <option value="7">Últimos 7 dias</option>
        <option value="30">Últimos 30 dias</option>
        <option value="90">Últimos 90 dias</option>
        <option value="custom">Personalizado</option>
      </select>
      {preset === 'custom' && <div className="ejc-stat-date-pair">
        <label>De <input aria-label="Data inicial" type="date" value={from} max={to || undefined} onChange={event => setFrom(event.target.value)} /></label>
        <label>Até <input aria-label="Data final" type="date" value={to} min={from || undefined} onChange={event => setTo(event.target.value)} /></label>
      </div>}
      <span className="ejc-stat-filter-note">Horário de Brasília · sem dados fictícios</span>
    </div>
    {error && <div className="notice error" role="alert">{error} <button type="button" className="btn ghost" onClick={() => setRefresh(value => value + 1)}>Tentar novamente</button></div>}
    {loading && <div className="ejc-stat-loading" role="status"><RefreshCw size={20} className="ejc-stat-spin" /> Carregando indicadores do sistema...</div>}
    {showReport && <>
      <header className="ejc-stat-print-header">
        <div className="ejc-stat-brand"><span>💌</span><div><strong>MINI MERCADO</strong><small>XX EJC · SIMONÉSIA 2026</small></div></div>
        <div className="ejc-stat-report-title">
          <span className="ejc-stat-eyebrow">RELATÓRIO ADMINISTRATIVO</span>
          <h1>O encontro em números</h1>
          <p>{report.period.from || report.period.to
            ? 'Período: ' + displayDate(report.period.from) + ' a ' + (report.period.to ? displayDate(report.period.to) : 'hoje')
            : 'Período: todo o histórico registrado'} · Emissão: {new Date(report.generated_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</p>
        </div>
      </header>
      <div className="ejc-stat-kpis">
        <Metric icon={Wallet} name="Pix confirmado" value={money(p.revenue_cents)} context={number(p.paid) + ' compras pagas'} tone="rose" />
        <Metric icon={HeartHandshake} name="Cartinhas pagas e enviadas" value={number(l.paid_submitted)} context={percent(l.paid_submitted, l.paid) + ' das cartinhas pagas'} tone="peach" />
        <Metric icon={UsersRound} name="Encontristas alcançados" value={number(covered)} context={'de ' + number(r.overview?.active) + ' encontristas ativos'} tone="lavender" />
        <Metric icon={Activity} name="Cartinhas com leitura registrada" value={number(l.read_count)} context={percent(l.read_count, l.paid_submitted) + ' das pagas e enviadas'} tone="blue" />
      </div>
      <Section eyebrow="01 / FINANCEIRO" title="Arrecadação e pagamentos"
        description="Uma compra agrupada conta como um único Pix, independentemente de quantas cartinhas contém. Cartas gratuitas e demonstrações são excluídas.">
        <div className="ejc-stat-metrics-secondary">
          <Metric icon={Wallet} name="Ticket médio confirmado" value={money(p.paid ? p.revenue_cents / p.paid : 0)} context="por Pix pago" />
          <Metric icon={BarChart3} name="Compras registradas" value={number(p.total)} context={number(p.grouped_total) + ' agrupadas'} />
          <Metric icon={CalendarDays} name="Pix a conferir" value={number((p.pending || 0) + (p.claimed || 0))} context={money(p.awaiting_cents) + ' aguardando'} />
          <Metric icon={TrendingUp} name="Conversão em pagamento" value={percent(p.paid, p.total)} context={number(p.cancelled) + ' compras canceladas'} />
        </div>
        <div className="ejc-stat-panels">
          <div className="ejc-stat-panel"><h3>Situação dos pagamentos</h3>
            <Ratio label="Confirmados" value={p.paid || 0} total={p.total || 0} color="pink" />
            <Ratio label="Aguardando Pix" value={p.pending || 0} total={p.total || 0} color="gold" />
            <Ratio label="Aguardando conferência" value={p.claimed || 0} total={p.total || 0} color="purple" />
            <Ratio label="Cancelados" value={p.cancelled || 0} total={p.total || 0} color="gray" />
          </div>
          <div className="ejc-stat-panel"><h3>Movimento financeiro</h3>
            <div className="ejc-stat-ledger"><span>Recebido e confirmado</span><b>{money(p.revenue_cents)}</b></div>
            <div className="ejc-stat-ledger"><span>Valor ainda não confirmado</span><b>{money(p.awaiting_cents)}</b></div>
            <div className="ejc-stat-ledger"><span>Valor de compras canceladas</span><b>{money(p.cancelled_cents)}</b></div>
            <div className="ejc-stat-ledger"><span>Compras em grupo confirmadas</span><b>{number(p.grouped_paid)}</b></div>
            <p className="ejc-stat-note">Conferência financeira baseada nos status salvos pelo admin. Não substitui o extrato do Sicoob.</p>
          </div>
        </div>
        <div className="ejc-stat-panel ejc-stat-chart-panel"><h3>Receita confirmada por dia <small>R$</small></h3><MoneyTrend rows={report.daily} /></div>
      </Section>
      <Section eyebrow="02 / CARTINHAS" title="Jornada das homenagens"
        description="O envio, a confirmação de pagamento e o registro de leitura são etapas diferentes. Rascunhos pagos permanecem visíveis nas pendências.">
        <div className="ejc-stat-metrics-secondary">
          <Metric icon={FileText} name="Cartinhas criadas" value={number(l.total)} context="sem campanhas oficiais" />
          <Metric icon={HeartHandshake} name="Cartinhas com Pix confirmado" value={number(l.paid)} context={number(l.paid_submitted) + ' finalizadas'} />
          <Metric icon={CalendarDays} name="Rascunhos pagos" value={number(l.paid_drafts)} context="precisam ser finalizados" tone="warning" />
          <Metric icon={ImageIcon} name="Cartinhas com anexos" value={number(l.with_media)} context="áudio ou foto disponível" />
        </div>
        <div className="ejc-stat-panel"><h3>Funil de conclusão</h3>
          <Ratio label="Cartinhas criadas" value={l.total || 0} total={l.total || 0} />
          <Ratio label="Com Pix confirmado" value={l.paid || 0} total={l.total || 0} color="purple" />
          <Ratio label="Pagas e finalizadas" value={l.paid_submitted || 0} total={l.total || 0} color="pink" />
          <Ratio label="Leituras registradas" value={l.read_count || 0} total={l.total || 0} color="blue" />
          <p className="ejc-stat-note">Há {number(l.awaiting_drafts)} rascunhos aguardando pagamento e {number(report.recovery.open)} rascunhos vazios pagos sinalizados para recuperação.</p>
        </div>
        <div className="ejc-stat-panels">
          <div className="ejc-stat-panel"><h3>Recuperação de rascunhos</h3>
            <div className="ejc-stat-ledger"><span>Casos identificados</span><b>{number(report.recovery.tracked)}</b></div>
            <div className="ejc-stat-ledger"><span>Recuperados</span><b>{number(report.recovery.recovered)}</b></div>
            <div className="ejc-stat-ledger"><span>Ainda sem recuperação registrada</span><b>{number(report.recovery.open)}</b></div>
            <div className="ejc-stat-ledger"><span>Destinatários avisados</span><b>{number(report.recovery.notified)}</b></div>
          </div>
          <div className="ejc-stat-panel"><h3>Fotos e áudios</h3>
            {report.media.length ? report.media.map(row => <div className="ejc-stat-ledger" key={row.kind}>
              <span>{row.kind === 'image' ? '📷 Imagens' : '🎙️ Áudios'}<small>{number(row.letters)} cartinhas</small></span>
              <b>{number(row.files)}<small>{byteSize(row.bytes)}</small></b>
            </div>) : <p className="ejc-stat-empty">Sem arquivos finalizados neste período.</p>}
            <p className="ejc-stat-note">Somente contagens e volume. Nenhum anexo, nome de remetente ou conteúdo privado é incluído.</p>
          </div>
        </div>
      </Section>
      <Section eyebrow="03 / ENCONTRISTAS" title="Alcance dos encontristas"
        description="Quantidade de cartas pagas recebidas por encontrista, sem revelar remetentes ou mensagens.">
        <div className="ejc-stat-metrics-secondary">
          <Metric icon={UsersRound} name="Encontristas cadastrados" value={number(r.overview?.total)} context={number(r.overview?.active) + ' ativos'} />
          <Metric icon={HeartHandshake} name="Com cartinha paga" value={number(withPaid)} context={percent(withPaid, r.overview?.active) + ' dos ativos'} />
          <Metric icon={ImageIcon} name="Com foto autorizada" value={number(r.overview?.photos)} context="identificação visual" />
          <Metric icon={MessageCircle} name="Com WhatsApp cadastrado" value={number(r.overview?.phones)} context={number(r.overview?.mural_codes) + ' códigos de mural'} />
        </div>
        <div className="ejc-stat-panel">
          <div className="ejc-stat-panel-heading"><h3>Cartinhas por encontrista</h3>
            {people.length > 12 && <button className="btn ghost no-print" type="button" onClick={() => setShowAll(value => !value)}>
              {showAll ? 'Mostrar principais' : 'Mostrar todos (' + number(people.length) + ')'}
            </button>}
          </div>
          <div className="ejc-stat-table-wrap">
            <table className="ejc-stat-table">
              <thead><tr><th>Encontrista</th><th>Criadas</th><th>Pagas</th><th>Finalizadas</th><th>Lidas</th></tr></thead>
              <tbody>{people.map((person, index) => <tr key={person.name + index}
                className={!showAll && index >= 12 ? 'ejc-stat-row-hidden' : ''}>
                <td><span className="ejc-stat-rank">{index + 1}</span> {person.name}{!person.active && <small> · inativo</small>}</td>
                <td>{number(person.letters)}</td><td>{number(person.paid)}</td>
                <td><strong>{number(person.received)}</strong></td><td>{number(person.read_count)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {!people.length && <p className="ejc-stat-empty">Nenhum encontrista cadastrado.</p>}
          <p className="ejc-stat-note">A impressão sempre inclui todos os encontristas, inclusive os que ainda não receberam cartinhas.</p>
        </div>
      </Section>
      <Section eyebrow="04 / ENTREGAS" title="WhatsApp, campanha e notificações"
        description="Os envios de WhatsApp são marcações manuais do admin; abrir o aplicativo não comprova a entrega.">
        <div className="ejc-stat-panels">
          <div className="ejc-stat-panel"><h3>WhatsApp</h3>
            {report.whatsapp.length ? report.whatsapp.map(row => <div key={row.campaign} className="ejc-stat-delivery">
              <h4>{campaignName(row.campaign)}</h4>
              <div className="ejc-stat-ledger"><span>Destinatários marcados</span><b>{number(row.recipients)}</b></div>
              <div className="ejc-stat-ledger"><span>Marcações de envio</span><b>{number(row.sends)}</b></div>
              <div className="ejc-stat-ledger"><span>Imagem confirmada manualmente</span><b>{number(row.image_confirmed)}</b></div>
            </div>) : <p className="ejc-stat-empty">Nenhum envio marcado no período.</p>}
          </div>
          <div className="ejc-stat-panel"><h3>Cartinhas oficiais gratuitas</h3>
            {report.campaigns.length ? report.campaigns.map(row => <div key={row.campaign} className="ejc-stat-delivery">
              <h4>{campaignName(row.campaign)}</h4>
              <div className="ejc-stat-ledger"><span>Criadas</span><b>{number(row.letters)}</b></div>
              <div className="ejc-stat-ledger"><span>Finalizadas</span><b>{number(row.published)}</b></div>
              <div className="ejc-stat-ledger"><span>Leituras registradas</span><b>{number(row.read_count)}</b></div>
            </div>) : <p className="ejc-stat-empty">Nenhuma campanha registrada no período.</p>}
          </div>
        </div>
        <div className="ejc-stat-panels">
          <div className="ejc-stat-panel"><h3>Notificações automáticas</h3>
            {report.notifications.length ? <div className="ejc-stat-table-wrap"><table className="ejc-stat-table">
              <thead><tr><th>Evento</th><th>Enviadas</th><th>Pendentes</th><th>Com tentativa</th></tr></thead>
              <tbody>{report.notifications.map(row => <tr key={row.kind}><td>{labelEvent(row.kind)}</td><td>{number(row.sent)}</td><td>{number(row.queued)}</td><td>{number(row.retrying)}</td></tr>)}</tbody>
            </table></div> : <p className="ejc-stat-empty">Sem notificações registradas.</p>}
          </div>
          <div className="ejc-stat-panel"><h3>Links de suporte</h3>
            {report.help.length ? report.help.map(row => <div className="ejc-stat-ledger" key={row.campaign}>
              <span>{campaignName(row.campaign)}</span><b>{number(row.clicks)} <small>acessos</small></b>
            </div>) : <p className="ejc-stat-empty">Sem acessos registrados.</p>}
            <p className="ejc-stat-note">Acessos agregados e anônimos, sem depender de consentimento para Google Analytics.</p>
          </div>
        </div>
      </Section>
      <Section eyebrow="05 / MOVIMENTO" title="Quando as cartinhas chegaram"
        description="Volume por data de criação e horário de Brasília. Os totais refletem o período escolhido.">
        <div className="ejc-stat-panel"><h3>Horários com mais compras</h3><HourDistribution rows={report.hours} /></div>
        <div className="ejc-stat-panel"><h3>Resumo por dia</h3>
          <div className="ejc-stat-table-wrap"><table className="ejc-stat-table">
            <thead><tr><th>Data</th><th>Compras</th><th>Pix pagos</th><th>Arrecadado</th><th>Cartinhas</th><th>Enviadas</th></tr></thead>
            <tbody>{report.daily.map((day, index) => <tr key={day.day} className={!showAll && index < report.daily.length - 14 ? 'ejc-stat-row-hidden' : ''}>
              <td>{displayDate(day.day)}</td><td>{number(day.purchases)}</td><td>{number(day.paid)}</td><td>{money(day.revenue_cents)}</td>
              <td>{number(day.letters)}</td><td>{number(day.submitted)}</td>
            </tr>)}</tbody>
          </table></div>
          {!report.daily.length && <p className="ejc-stat-empty">Nenhuma atividade registrada no período.</p>}
          {report.daily.length > 14 && <button className="btn ghost no-print" type="button" onClick={() => setShowAll(value => !value)}>
            {showAll ? 'Recolher tabelas' : 'Ver todos os dias (' + number(report.daily.length) + ')'}
          </button>}
        </div>
      </Section>
      <footer className="ejc-stat-footer">
        <ShieldCheck size={18} aria-hidden="true" />
        <p>Relatório administrativo do Mini Mercado do XX EJC Simonésia. Dados extraídos do sistema na data de emissão. Não inclui mensagens, áudios, imagens, remetentes, contatos pessoais ou tokens de acesso. O valor de Pix confirmado corresponde às baixas registradas no sistema e não substitui conciliação bancária.</p>
      </footer>
    </>}
  </div>;
}
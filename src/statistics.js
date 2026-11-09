// Administrative aggregates only: never select letter bodies, private tokens, media keys or senders.
const PAID = "('paid','preparing','delivered')";
const ACTIVE_LETTERS = "o.demo=0 AND o.campaign_key IS NULL";

function dateFilter(column, from, to) {
  // Only validated ISO calendar dates enter the SQL. Do not accept arbitrary query fragments.
  return (from ? " AND date(" + column + ", '-3 hours') >= '" + from + "'" : '') +
    (to ? " AND date(" + column + ", '-3 hours') <= '" + to + "'" : '');
}

const num = value => Number(value || 0);

export async function adminStatistics(env, { from = '', to = '' } = {}) {
  const scope = dateFilter('o.created_at', from, to);
  const paySource =
    'SELECT c.status,c.total_cents,c.created_at,1 AS grouped FROM checkouts c ' +
      'WHERE EXISTS(SELECT 1 FROM orders o WHERE o.checkout_id=c.id AND ' + ACTIVE_LETTERS + ')' +
      dateFilter('c.created_at', from, to) +
    ' UNION ALL SELECT o.status,o.total_cents,o.created_at,0 AS grouped FROM orders o ' +
      'WHERE o.checkout_id IS NULL AND ' + ACTIVE_LETTERS + scope;
  const paymentsCte = 'WITH payments AS (' + paySource + ') ';
  const letterWhere = ' WHERE ' + ACTIVE_LETTERS + scope;
  const paymentSummarySql = paymentsCte +
    'SELECT COUNT(*) AS total, ' +
    "SUM(CASE WHEN status IN " + PAID + " THEN 1 ELSE 0 END) AS paid, " +
    "SUM(CASE WHEN status='claimed' THEN 1 ELSE 0 END) AS claimed, " +
    "SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending, " +
    "SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled, " +
    "SUM(CASE WHEN status IN " + PAID + " THEN total_cents ELSE 0 END) AS revenue_cents, " +
    "SUM(CASE WHEN status IN ('pending','claimed') THEN total_cents ELSE 0 END) AS awaiting_cents, " +
    "SUM(CASE WHEN status='cancelled' THEN total_cents ELSE 0 END) AS cancelled_cents, " +
    "SUM(CASE WHEN grouped=1 THEN 1 ELSE 0 END) AS grouped_total, " +
    "SUM(CASE WHEN grouped=1 AND status IN " + PAID + " THEN 1 ELSE 0 END) AS grouped_paid " +
    'FROM payments';
  const letterSummarySql =
    'SELECT COUNT(*) AS total, ' +
    'SUM(CASE WHEN o.submitted_at IS NOT NULL THEN 1 ELSE 0 END) AS submitted, ' +
    'SUM(CASE WHEN o.status IN ' + PAID + ' THEN 1 ELSE 0 END) AS paid, ' +
    'SUM(CASE WHEN o.status IN ' + PAID + ' AND o.submitted_at IS NOT NULL THEN 1 ELSE 0 END) AS paid_submitted, ' +
    'SUM(CASE WHEN o.status IN ' + PAID + ' AND o.submitted_at IS NULL THEN 1 ELSE 0 END) AS paid_drafts, ' +
    "SUM(CASE WHEN o.status IN ('pending','claimed') AND o.submitted_at IS NULL THEN 1 ELSE 0 END) AS awaiting_drafts, " +
    'SUM(CASE WHEN o.status IN ' + PAID + ' AND o.first_read_at IS NOT NULL THEN 1 ELSE 0 END) AS read_count, ' +
    "SUM(CASE WHEN EXISTS(SELECT 1 FROM media m WHERE m.order_id=o.id AND m.status='ready') THEN 1 ELSE 0 END) AS with_media " +
    'FROM orders o' + letterWhere;
  const dailyPaymentsSql = paymentsCte +
    "SELECT date(created_at, '-3 hours') AS day,COUNT(*) AS purchases," +
    "SUM(CASE WHEN status IN " + PAID + " THEN total_cents ELSE 0 END) AS revenue_cents," +
    "SUM(CASE WHEN status IN " + PAID + " THEN 1 ELSE 0 END) AS paid " +
    'FROM payments GROUP BY day ORDER BY day';
  const dailyLettersSql =
    "SELECT date(o.created_at, '-3 hours') AS day,COUNT(*) AS letters," +
    'SUM(CASE WHEN o.submitted_at IS NOT NULL THEN 1 ELSE 0 END) AS submitted ' +
    'FROM orders o' + letterWhere + ' GROUP BY day ORDER BY day';
  const hoursSql = paymentsCte +
    "SELECT strftime('%H',created_at,'-3 hours') AS hour,COUNT(*) AS purchases " +
    'FROM payments GROUP BY hour ORDER BY hour';
  const recipientsSql =
    'SELECT r.id,r.name,r.active, ' +
    'COUNT(o.id) AS letters, ' +
    'SUM(CASE WHEN o.status IN ' + PAID + ' THEN 1 ELSE 0 END) AS paid, ' +
    'SUM(CASE WHEN o.status IN ' + PAID + ' AND o.submitted_at IS NOT NULL THEN 1 ELSE 0 END) AS received, ' +
    'SUM(CASE WHEN o.status IN ' + PAID + ' AND o.first_read_at IS NOT NULL THEN 1 ELSE 0 END) AS read_count ' +
    'FROM recipients r LEFT JOIN orders o ON o.recipient_id=r.id AND ' + ACTIVE_LETTERS + scope +
    ' GROUP BY r.id,r.name,r.active ORDER BY received DESC, paid DESC,r.name COLLATE NOCASE';
  const coverageSql =
    'SELECT COUNT(*) AS total,' +
    'SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS active,' +
    "SUM(CASE WHEN photo_key IS NOT NULL AND photo_consent=1 THEN 1 ELSE 0 END) AS photos," +
    "SUM(CASE WHEN whatsapp_phone<>'' THEN 1 ELSE 0 END) AS phones," +
    "SUM(CASE WHEN mural_code IS NOT NULL AND mural_code<>'' THEN 1 ELSE 0 END) AS mural_codes " +
    'FROM recipients';
  const mediaSql =
    'SELECT m.kind,COUNT(*) AS files,COUNT(DISTINCT o.id) AS letters,' +
    'COALESCE(SUM(m.bytes),0) AS bytes ' +
    'FROM media m JOIN orders o ON o.id=m.order_id ' +
    "WHERE m.status='ready' AND " + ACTIVE_LETTERS + scope +
    ' GROUP BY m.kind ORDER BY m.kind';
  const campaignsSql =
    'SELECT o.campaign_key AS campaign,COUNT(*) AS letters,' +
    'SUM(CASE WHEN o.submitted_at IS NOT NULL THEN 1 ELSE 0 END) AS published,' +
    'SUM(CASE WHEN o.first_read_at IS NOT NULL THEN 1 ELSE 0 END) AS read_count ' +
    'FROM orders o WHERE o.campaign_key IS NOT NULL AND o.demo=0' +
    scope + ' GROUP BY o.campaign_key';
  const whatsappSql =
    'SELECT d.campaign_key AS campaign,COUNT(*) AS recipients,' +
    'COALESCE(SUM(d.send_count),0) AS sends,' +
    'SUM(CASE WHEN d.image_sent=1 THEN 1 ELSE 0 END) AS image_confirmed ' +
    'FROM recipient_whatsapp_deliveries d WHERE 1=1' +
    dateFilter('d.sent_at', from, to) + ' GROUP BY d.campaign_key';
  const recoverySql =
    'SELECT COUNT(*) AS tracked,' +
    'SUM(CASE WHEN d.recovered_at IS NOT NULL THEN 1 ELSE 0 END) AS recovered,' +
    'SUM(CASE WHEN d.recovered_at IS NULL THEN 1 ELSE 0 END) AS open,' +
    'SUM(CASE WHEN d.recipient_notified_at IS NOT NULL THEN 1 ELSE 0 END) AS notified ' +
    'FROM draft_recovery d JOIN orders o ON o.id=d.order_id WHERE ' +
    ACTIVE_LETTERS + scope;
  const helpSql =
    'SELECT campaign,SUM(clicks) AS clicks FROM help_link_counts WHERE 1=1' +
    (from ? " AND day>='" + from + "'" : '') + (to ? " AND day<='" + to + "'" : '') +
    ' GROUP BY campaign ORDER BY clicks DESC';
  const notificationSql =
    'SELECT n.event AS kind,COUNT(*) AS total,' +
    'SUM(CASE WHEN n.sent_at IS NOT NULL THEN 1 ELSE 0 END) AS sent,' +
    'SUM(CASE WHEN n.sent_at IS NULL THEN 1 ELSE 0 END) AS queued,' +
    'SUM(CASE WHEN n.attempts>0 AND n.sent_at IS NULL THEN 1 ELSE 0 END) AS retrying ' +
    'FROM notification_outbox n JOIN orders o ON o.id=n.order_id WHERE ' +
    ACTIVE_LETTERS + dateFilter('n.created_at', from, to) +
    ' GROUP BY n.event ORDER BY total DESC';

  const [
    paymentSummary, letterSummary, dailyPayments, dailyLetters, hours, recipients,
    coverage, media, campaigns, whatsapp, recovery, help, notifications
  ] = await Promise.all([
    env.DB.prepare(paymentSummarySql).first(),
    env.DB.prepare(letterSummarySql).first(),
    env.DB.prepare(dailyPaymentsSql).all(),
    env.DB.prepare(dailyLettersSql).all(),
    env.DB.prepare(hoursSql).all(),
    env.DB.prepare(recipientsSql).all(),
    env.DB.prepare(coverageSql).first(),
    env.DB.prepare(mediaSql).all(),
    env.DB.prepare(campaignsSql).all(),
    env.DB.prepare(whatsappSql).all(),
    env.DB.prepare(recoverySql).first(),
    env.DB.prepare(helpSql).all(),
    env.DB.prepare(notificationSql).all()
  ]);
  const days = new Map();
  for (const row of dailyPayments.results || []) {
    days.set(row.day, { day: row.day, purchases: num(row.purchases),
      paid: num(row.paid), revenue_cents: num(row.revenue_cents), letters: 0, submitted: 0 });
  }
  for (const row of dailyLetters.results || []) {
    const day = days.get(row.day) || { day: row.day, purchases: 0, paid: 0,
      revenue_cents: 0, letters: 0, submitted: 0 };
    day.letters = num(row.letters);
    day.submitted = num(row.submitted);
    days.set(row.day, day);
  }
  return {
    generated_at: new Date().toISOString(),
    period: { from: from || null, to: to || null, timezone: 'America/Sao_Paulo' },
    // Purchase totals are from checkouts + legacy standalone orders, never checkout children.
    payments: Object.fromEntries(Object.entries(paymentSummary || {}).map(([key, value]) => [key, num(value)])),
    letters: Object.fromEntries(Object.entries(letterSummary || {}).map(([key, value]) => [key, num(value)])),
    recipients: {
      overview: Object.fromEntries(Object.entries(coverage || {}).map(([key, value]) => [key, num(value)])),
      ranking: (recipients.results || []).map(row => ({
        name: row.name, active: !!row.active, letters: num(row.letters), paid: num(row.paid),
        received: num(row.received), read_count: num(row.read_count)
      }))
    },
    daily: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    hours: (hours.results || []).map(row => ({ hour: row.hour, purchases: num(row.purchases) })),
    media: (media.results || []).map(row => ({
      kind: row.kind, files: num(row.files), letters: num(row.letters), bytes: num(row.bytes)
    })),
    campaigns: (campaigns.results || []).map(row => ({
      campaign: row.campaign, letters: num(row.letters), published: num(row.published),
      read_count: num(row.read_count)
    })),
    whatsapp: (whatsapp.results || []).map(row => ({
      campaign: row.campaign, recipients: num(row.recipients), sends: num(row.sends),
      image_confirmed: num(row.image_confirmed)
    })),
    recovery: Object.fromEntries(Object.entries(recovery || {}).map(([key, value]) => [key, num(value)])),
    help: (help.results || []).map(row => ({ campaign: row.campaign, clicks: num(row.clicks) })),
    notifications: (notifications.results || []).map(row => ({
      kind: row.kind, total: num(row.total), sent: num(row.sent),
      queued: num(row.queued), retrying: num(row.retrying)
    }))
  };
}
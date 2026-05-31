const router = require('express').Router();
const db = require('../db');

const upsertStmt = db.prepare(`
  INSERT OR REPLACE INTO companies
    (id, company_name, tenant_id, client_id, client_secret, sync_mailboxes, expiry_alert_emails, notify_emails, api_expiration_date, color, logo)
  VALUES
    (@id, @companyName, @tenantId, @clientId, @clientSecret, @syncMailboxes, @expiryAlertEmails, @notifyEmails, @apiExpirationDate, @color, @logo)
`);

// Sync full company list: upsert incoming, delete any not in list
const syncCompanies = db.transaction((list) => {
  if (!list.length) return; // safety: never wipe all companies
  const ids = list.map(c => c.id);
  const placeholders = ids.map(() => '?').join(',');
  // Delete companies removed by admin
  db.prepare(`DELETE FROM companies WHERE id NOT IN (${placeholders})`).run(...ids);
  // Upsert remaining
  for (const c of list) upsertStmt.run(c);
});

// GET /api/companies — return full company list (display fields + credentials)
// Behind nginx same-origin proxy with API key; used to restore state across devices.
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM companies').all();
  res.json(rows.map(r => ({
    id:                r.id,
    companyName:       r.company_name,
    tenantId:          r.tenant_id     || '',
    clientId:          r.client_id     || '',
    clientSecret:      r.client_secret || '',
    syncMailboxes:     JSON.parse(r.sync_mailboxes      || '[]'),
    expiryAlertEmails: JSON.parse(r.expiry_alert_emails || '[]'),
    notifyEmails:      JSON.parse(r.notify_emails       || '[]'),
    apiExpirationDate: r.api_expiration_date || '',
    color:             r.color || '',
    logo:              r.logo  || '',
  })));
});

// POST /api/companies — receive full company list from frontend admin save
router.post('/', (req, res) => {
  const companies = req.body;
  if (!Array.isArray(companies)) return res.status(400).json({ error: 'Expected array' });

  const mapped = companies.map(c => ({
    id:                 c.id,
    companyName:        c.companyName || '',
    tenantId:           c.tenantId    || '',
    clientId:           c.clientId    || '',
    clientSecret:       c.clientSecret || '',
    syncMailboxes:      JSON.stringify(c.syncMailboxes      || []),
    expiryAlertEmails:  JSON.stringify(c.expiryAlertEmails  || []),
    notifyEmails:       JSON.stringify(c.notifyEmails       || []),
    apiExpirationDate:  c.apiExpirationDate || '',
    color:              c.color             || '',
    logo:               c.logo              || '',
  }));

  syncCompanies(mapped);
  res.json({ saved: companies.length });
});

module.exports = router;

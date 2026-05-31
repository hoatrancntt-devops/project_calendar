const router = require('express').Router();
const db = require('../db');

const upsertUser = db.prepare(`
  INSERT OR REPLACE INTO app_users (id, email, name, password, allowed_company_ids, allowed_mailboxes)
  VALUES (@id, @email, @name, @password, @allowedCompanyIds, @allowedMailboxes)
`);

const syncUsers = db.transaction((users) => {
  if (!users.length) return;
  const ids = users.map(u => u.id);
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM app_users WHERE id NOT IN (${placeholders})`).run(...ids);
  for (const u of users) upsertUser.run(u);
});

// GET /api/users — return all app users
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM app_users').all();
  res.json(rows.map(r => ({
    id:                r.id,
    email:             r.email,
    name:              r.name,
    password:          r.password,
    allowedCompanyIds: JSON.parse(r.allowed_company_ids || '[]'),
    allowedMailboxes:  JSON.parse(r.allowed_mailboxes   || '{}'),
  })));
});

// POST /api/users — sync full user list (upsert + delete removed)
router.post('/', (req, res) => {
  const users = req.body;
  if (!Array.isArray(users)) return res.status(400).json({ error: 'Expected array' });
  syncUsers(users.map(u => ({
    id:                u.id,
    email:             u.email             || '',
    name:              u.name              || '',
    password:          u.password          || '',
    allowedCompanyIds: JSON.stringify(u.allowedCompanyIds || []),
    allowedMailboxes:  JSON.stringify(u.allowedMailboxes  || {}),
  })));
  res.json({ saved: users.length });
});

module.exports = router;

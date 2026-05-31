const router = require('express').Router();
const db = require('../db');

// GET /api/settings — return admin settings JSON blob
router.get('/', (req, res) => {
  const row = db.prepare('SELECT data FROM app_settings WHERE id = 1').get();
  try { res.json(JSON.parse(row?.data || '{}')); }
  catch { res.json({}); }
});

// POST /api/settings — persist admin settings JSON blob
router.post('/', (req, res) => {
  const data = JSON.stringify(req.body || {});
  db.prepare('UPDATE app_settings SET data = ? WHERE id = 1').run(data);
  res.json({ saved: true });
});

module.exports = router;

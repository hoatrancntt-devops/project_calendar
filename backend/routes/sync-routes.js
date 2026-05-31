const router  = require('express').Router();
const { syncAll } = require('../services/calendar-sync');

// POST /api/sync — trigger immediate sync for all companies with credentials
router.post('/', async (_req, res) => {
  try {
    const results = await syncAll();
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

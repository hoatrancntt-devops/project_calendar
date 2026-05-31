const express = require('express');
const helmet  = require('helmet');
const { startSyncJob } = require('./jobs/sync-job');

const app    = express();
const PORT   = process.env.PORT || 3000;
// Internal API key — nginx injects this header on every proxied request.
// Clients cannot forge it since nginx's proxy_set_header overwrites client headers.
const API_KEY = process.env.BACKEND_API_SECRET || '';

function requireApiKey(req, res, next) {
  if (!API_KEY || req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.use(helmet());
// No CORS needed — backend is only reachable via nginx same-origin proxy
app.use(express.json({ limit: '5mb' })); // allow base64 company logos in the payload

// Expose the auth middleware for routes to use
app.set('requireApiKey', requireApiKey);

app.use('/api/companies', requireApiKey, require('./routes/company-routes'));
app.use('/api/events',   requireApiKey, require('./routes/event-routes'));
app.use('/api/sync',     requireApiKey, require('./routes/sync-routes'));
app.use('/api/mail',     requireApiKey, require('./routes/mail-routes'));
app.use('/api/settings', requireApiKey, require('./routes/settings-routes'));
app.use('/api/users',    requireApiKey, require('./routes/app-users-routes'));
app.get('/api/health',   (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`[calendar-backend] listening on :${PORT}`);
  startSyncJob();
});

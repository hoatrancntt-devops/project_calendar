const router = require('express').Router();
const db = require('../db');

// Serves the PWA manifest + home-screen icons derived from the admin-uploaded global logo.
// Mounted under /api so nginx proxies these (and injects the internal API key) without any
// nginx change. IMPORTANT: icon paths have NO image extension — nginx's `\.(png|...)$` regex
// location would otherwise intercept them as static files and 404. Content-Type drives rendering.

function getSettings() {
  try { return JSON.parse(db.prepare('SELECT data FROM app_settings WHERE id = 1').get()?.data || '{}'); }
  catch { return {}; }
}

function sendPng(res, dataUrl) {
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl || '');
  if (!m) return res.status(404).end();
  const buf = Buffer.from(m[1], 'base64');
  res.set('Content-Type', 'image/png');
  res.set('Cache-Control', 'public, max-age=3600'); // logo changes rarely; 1h is a safe refresh window
  res.send(buf);
}

// Web App Manifest — fixed app identity ("Lịch Họp - HLV"), icons sourced from stored logo.
router.get('/manifest.webmanifest', (_req, res) => {
  const s = getSettings();
  const icons = [];
  if (s.appIcon192) icons.push({ src: '/api/app-icon-192', sizes: '192x192', type: 'image/png', purpose: 'any maskable' });
  if (s.appIcon512) icons.push({ src: '/api/app-icon-512', sizes: '512x512', type: 'image/png', purpose: 'any maskable' });
  res.set('Content-Type', 'application/manifest+json');
  res.set('Cache-Control', 'no-cache'); // always reflect the latest uploaded logo
  res.send(JSON.stringify({
    name: 'Lịch Họp - HLV',
    short_name: 'Lịch Họp',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0f766e',
    icons,
  }));
});

router.get('/app-icon-192',     (_req, res) => sendPng(res, getSettings().appIcon192));
router.get('/app-icon-512',     (_req, res) => sendPng(res, getSettings().appIcon512));
router.get('/apple-touch-icon', (_req, res) => sendPng(res, getSettings().appIcon180));

module.exports = router;

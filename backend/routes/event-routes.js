const router = require('express').Router();
const db = require('../db');

// GET /api/events?companyIds=c-suleco,c-asn&mailboxes=ceo@suleco.vn
// companyIds is REQUIRED — prevents accidental fetch of all tenants' data
router.get('/', (req, res) => {
  const { companyIds, mailboxes } = req.query;
  if (!companyIds) return res.status(400).json({ error: 'companyIds is required' });

  const conditions = [];
  const params     = [];

  const ids = companyIds.split(',').map(s => s.trim()).filter(Boolean);
  conditions.push(`company_id IN (${ids.map(() => '?').join(',')})`);
  params.push(...ids);

  if (mailboxes) {
    const mbs = mailboxes.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    conditions.push(`LOWER(mailbox) IN (${mbs.map(() => '?').join(',')})`);
    params.push(...mbs);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows  = db.prepare(`SELECT * FROM events ${where} ORDER BY date, time`).all(...params);

  res.json(rows.map(e => ({
    id:             `${e.company_id}::${e.id}`,
    companyId:      e.company_id,
    mailbox:        e.mailbox,
    title:          e.title,
    date:           e.date,
    time:           e.time,
    type:           e.type,
    location:       e.location,
    joinUrl:        e.join_url,
    room:           e.room,
    attendees:      e.attendees,
    attendeeCount:  e.attendee_count,
    organizer:      e.organizer,
    organizerName:  e.organizer_name,
    status:         e.status,
    _source:        'api',
  })));
});

module.exports = router;

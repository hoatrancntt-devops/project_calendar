const axios      = require('axios');
const db         = require('../db');
const { getToken } = require('./graph-auth');
const { sendMail } = require('./smtp-mail');

const TZ = 'Asia/Ho_Chi_Minh';
const HCM_OFFSET_MS = 7 * 60 * 60 * 1000; // HCM is fixed UTC+7 (no DST)

/**
 * Convert a Graph API dateTime to HCM wall-clock components.
 * Graph (no Prefer header) returns times in UTC: either floating
 * ("2026-05-28T01:30:00.0000000", no Z) or with Z suffix.
 *
 * NOTE: Alpine Docker images lack tzdata, so Intl timeZone conversion
 * (toLocaleString with timeZone) silently falls back to UTC and breaks.
 * We therefore add the fixed +7h offset manually and read UTC components.
 */
function toHCMComponents(dtStr) {
  if (!dtStr) return { date: '', hhmm: '' };
  const hasZoneInfo = dtStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dtStr);
  // Treat floating (zone-less) Graph times as UTC by appending 'Z'
  const utc = hasZoneInfo
    ? new Date(dtStr)
    : new Date(dtStr.replace(/\.\d+$/, '') + 'Z');
  if (isNaN(utc.getTime())) return { date: '', hhmm: '' };
  // Shift the UTC instant by +7h, then read UTC fields = HCM wall clock
  const hcm = new Date(utc.getTime() + HCM_OFFSET_MS);
  const pad = n => String(n).padStart(2, '0');
  return {
    date:  `${hcm.getUTCFullYear()}-${pad(hcm.getUTCMonth()+1)}-${pad(hcm.getUTCDate())}`,
    hhmm:  `${pad(hcm.getUTCHours())}:${pad(hcm.getUTCMinutes())}`,
  };
}

/** Map a Graph calendarView item to the shape the frontend expects. */
function transformEvent(item, companyId, mailbox) {
  const start = toHCMComponents(item.start?.dateTime);
  const end   = toHCMComponents(item.end?.dateTime);

  // Phòng họp: ưu tiên resource attendee (room booking), fallback location.displayName
  const roomAttendee = (item.attendees || []).find(a => a.type === 'resource');
  const room = roomAttendee?.emailAddress?.name || item.location?.displayName || '';

  // Người tham dự (bỏ qua resource/room)
  const humanAttendees = (item.attendees || []).filter(a => a.type !== 'resource');

  return {
    id:             item.id,
    companyId,
    mailbox,
    title:          item.subject || '(Không có tiêu đề)',
    date:           start.date,
    time:           start.hhmm && end.hhmm ? `${start.hhmm} - ${end.hhmm}` : '',
    type:           item.isOnlineMeeting ? 'teams' : 'offline',
    location:       item.location?.displayName || (item.isOnlineMeeting ? 'Microsoft Teams' : ''),
    room,
    attendees:      humanAttendees.map(a => a.emailAddress?.address).filter(Boolean).join(', '),
    attendeeCount:  humanAttendees.length,
    organizer:      item.organizer?.emailAddress?.address || '',
    organizerName:  item.organizer?.emailAddress?.name || item.organizer?.emailAddress?.address || '',
    status:         item.isCancelled ? 'cancelled' : (item.showAs === 'tentative' ? 'pending' : 'confirmed'),
  };
}

const deleteByCompany = db.prepare('DELETE FROM events WHERE company_id = ?');
const insertEvent     = db.prepare(`
  INSERT OR REPLACE INTO events
    (id, company_id, mailbox, title, date, time, type, location, room, attendees, attendee_count, organizer, organizer_name, status, synced_at)
  VALUES
    (@id, @companyId, @mailbox, @title, @date, @time, @type, @location, @room, @attendees, @attendeeCount, @organizer, @organizerName, @status, @syncedAt)
`);

async function syncCompany(company) {
  const mailboxes = JSON.parse(company.sync_mailboxes || '[]');
  if (!company.tenant_id || !company.client_id || !company.client_secret || !mailboxes.length) {
    const missing = [
      !company.tenant_id    && 'tenant_id',
      !company.client_id    && 'client_id',
      !company.client_secret && 'client_secret',
      !mailboxes.length     && 'sync_mailboxes',
    ].filter(Boolean);
    console.log(`[sync] ${company.id}: skipped — missing: ${missing.join(', ')}`);
    return { companyId: company.id, skipped: true };
  }

  const token  = await getToken(company.tenant_id, company.client_id, company.client_secret);
  // Sync window: start of current week (Mon) → +90 days — captures recent past events
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7)); // roll back to Monday
  monday.setHours(0, 0, 0, 0);
  const startDT = monday.toISOString();
  const future  = new Date(Date.now() + 90 * 24 * 3_600_000).toISOString(); // +90 days
  const select = 'id,subject,start,end,location,isOnlineMeeting,attendees,organizer,showAs,isCancelled';
  const syncedAt = new Date().toISOString();

  const events = [];
  for (const mailbox of mailboxes) {
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/calendarView` +
      `?startDateTime=${encodeURIComponent(startDT)}&endDateTime=${encodeURIComponent(future)}` +
      `&$top=50&$select=${select}`;
    let data;
    try {
      ({ data } = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } }));
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.error?.message || err.message;
      console.error(`[sync] ${company.id}/${mailbox}: Graph API ${status} — ${detail}`);
      throw new Error(`Graph API ${status}: ${detail}`);
    }
    for (const item of (data.value || [])) events.push(transformEvent(item, company.id, mailbox));
  }

  // Detect new events: compare against existing event IDs before replacing
  const existingRows = db.prepare('SELECT id FROM events WHERE company_id = ?').all(company.id);
  const existingIds  = new Set(existingRows.map(r => r.id));
  const newEvents    = events.filter(ev => !existingIds.has(ev.id));

  db.transaction(() => {
    deleteByCompany.run(company.id);
    for (const ev of events) insertEvent.run({ ...ev, syncedAt });
  })();

  // Email notification for genuinely new events — skip the very first sync (no prior events)
  // to avoid mass-emailing the whole calendar on initial setup.
  const notifyEmails = JSON.parse(company.notify_emails || '[]');
  if (existingIds.size > 0 && newEvents.length > 0 && notifyEmails.length > 0) {
    sendNewEventsEmail(company, newEvents, notifyEmails).catch(err =>
      console.error(`[notify] ${company.id}: email failed — ${err.message}`));
  }

  return { companyId: company.id, synced: events.length, new: newEvents.length };
}

/** Send an email listing newly-added calendar events to the company's notify recipients. */
async function sendNewEventsEmail(company, newEvents, recipients) {
  const rows = newEvents
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .map(ev => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;white-space:nowrap;">${ev.date} ${ev.time}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;">${ev.title}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${ev.type === 'teams' ? '📹 Teams' : '📍 ' + (ev.room || ev.location || 'Offline')}</td>
      </tr>`).join('');

  await sendMail({
    to: recipients,
    subject: `[LỊCH MỚI] ${company.company_name} — ${newEvents.length} sự kiện mới`,
    html: `
      <h2 style="color:#0f766e;">📅 Có ${newEvents.length} lịch họp mới — ${company.company_name}</h2>
      <p>Hệ thống vừa đồng bộ các sự kiện mới từ Microsoft 365:</p>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;width:100%;max-width:640px;">
        <thead><tr style="background:#f1f5f9;">
          <th style="padding:8px 10px;text-align:left;">Thời gian</th>
          <th style="padding:8px 10px;text-align:left;">Nội dung</th>
          <th style="padding:8px 10px;text-align:left;">Hình thức</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:16px;color:#64748b;font-size:12px;">Email tự động từ Hệ thống Lịch Trình.</p>
    `,
  });
  console.log(`[notify] ${company.id}: sent ${newEvents.length} new events to ${recipients.length} recipients`);
}

async function syncAll() {
  const companies = db.prepare('SELECT * FROM companies').all();
  const results   = [];
  for (const company of companies) {
    try   { results.push(await syncCompany(company)); }
    catch (err) { results.push({ companyId: company.id, error: err.message }); }
  }
  return results;
}

module.exports = { syncCompany, syncAll, sendNewEventsEmail };

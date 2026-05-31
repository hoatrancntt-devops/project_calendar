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

// Record last notification result per company (surfaced in Settings UI).
// OK clears any prior error; ERR keeps the last success time intact.
const recordNotifyOk = db.prepare(`
  INSERT INTO notify_status (company_id, last_at, last_error) VALUES (?, ?, '')
  ON CONFLICT(company_id) DO UPDATE SET last_at = excluded.last_at, last_error = ''
`);
const recordNotifyErr = db.prepare(`
  INSERT INTO notify_status (company_id, last_at, last_error) VALUES (?, '', ?)
  ON CONFLICT(company_id) DO UPDATE SET last_error = excluded.last_error
`);

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
  // Sync window: 30 days back → +90 days forward. The lookback captures meetings
  // created for recent past dates (previously missed when the window started at
  // this Monday), so they still appear on the calendar.
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - 30);
  windowStart.setHours(0, 0, 0, 0);
  const startDT = windowStart.toISOString();
  const future  = new Date(Date.now() + 90 * 24 * 3_600_000).toISOString(); // +90 days
  const select = 'id,subject,start,end,location,isOnlineMeeting,attendees,organizer,showAs,isCancelled';
  const syncedAt = new Date().toISOString();

  // Fetch ALL events in window via pagination — Graph caps a page at $top, so we
  // must follow @odata.nextLink. $orderby gives deterministic paging (chronological).
  // Without this, only the first 50 were fetched → events beyond that were never
  // synced nor detected as "new" (silent truncation).
  const PAGE_SIZE       = 100;
  const MAX_PER_MAILBOX = 1000; // safety cap to bound a runaway calendar
  const events = [];
  for (const mailbox of mailboxes) {
    let url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}/calendarView` +
      `?startDateTime=${encodeURIComponent(startDT)}&endDateTime=${encodeURIComponent(future)}` +
      `&$orderby=${encodeURIComponent('start/dateTime')}&$top=${PAGE_SIZE}&$select=${select}`;
    let fetched = 0;
    while (url && fetched < MAX_PER_MAILBOX) {
      let data;
      try {
        ({ data } = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } }));
      } catch (err) {
        const status = err.response?.status;
        const detail = err.response?.data?.error?.message || err.message;
        console.error(`[sync] ${company.id}/${mailbox}: Graph API ${status} — ${detail}`);
        throw new Error(`Graph API ${status}: ${detail}`);
      }
      for (const item of (data.value || [])) { events.push(transformEvent(item, company.id, mailbox)); fetched++; }
      url = data['@odata.nextLink'] || null;
    }
    if (fetched >= MAX_PER_MAILBOX) {
      console.warn(`[sync] ${company.id}/${mailbox}: hit MAX_PER_MAILBOX cap (${MAX_PER_MAILBOX}) — some events may be unsynced`);
    }
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
  // to avoid mass-emailing the whole calendar on initial setup. Only alert for UPCOMING
  // events (date >= today HCM) so the 30-day lookback doesn't notify about past meetings.
  const notifyEmails = JSON.parse(company.notify_emails || '[]');
  const todayHCM = new Date(Date.now() + HCM_OFFSET_MS).toISOString().slice(0, 10);
  const upcomingNew = newEvents.filter(ev => ev.date && ev.date >= todayHCM);
  if (existingIds.size > 0 && upcomingNew.length > 0 && notifyEmails.length > 0) {
    sendNewEventsEmail(company, upcomingNew, notifyEmails)
      .then(() => recordNotifyOk.run(company.id, new Date().toISOString()))
      .catch(err => {
        console.error(`[notify] ${company.id}: email failed — ${err.message}`);
        recordNotifyErr.run(company.id, err.message);  // surfaced in Settings UI
      });
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

  // Source mailbox(es) the new events came from. A company may sync several mailboxes,
  // so collapse to "N hòm thư" when more than one to keep the subject readable.
  const fromList  = [...new Set(newEvents.map(ev => ev.mailbox).filter(Boolean))];
  const fromLabel = fromList.length === 1 ? fromList[0]
                  : fromList.length > 1  ? `${fromList.length} hòm thư`
                  : '';
  const fromPart  = fromLabel ? ` từ ${fromLabel}` : '';

  await sendMail({
    to: recipients,
    subject: `Thông báo - Có ${newEvents.length} lịch họp mới${fromPart} - ${company.company_name}`,
    html: `
      <h2 style="color:#0f766e;">📅 Có ${newEvents.length} lịch họp mới${fromPart} — ${company.company_name}</h2>
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

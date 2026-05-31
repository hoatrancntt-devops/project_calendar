// Build a printable HTML document for the calendar and open the browser print dialog.
// Browser print preview doubles as PDF view + "Save as PDF".

const DAY_NAMES = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const MONTH_NAMES = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];

const fmtDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

function getWeekDays(d) {
  const offset = (d.getDay() + 6) % 7;
  const mon = new Date(d); mon.setDate(d.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setDate(mon.getDate() + i); return x; });
}

/** One event row HTML (used by day/week list layouts). */
function eventRow(ev, color) {
  const loc = ev.type === 'teams' ? 'Microsoft Teams' : (ev.room || ev.location || 'Offline');
  const organizer = ev.organizerName || ev.organizer || '';
  const attendees = ev.attendees || (ev.attendeeCount ? `${ev.attendeeCount} người` : '');
  return `
    <tr>
      <td class="time">${esc(ev.time || '')}</td>
      <td class="title" style="border-left:4px solid ${color};">
        <div class="ev-title">${esc(ev.title)}</div>
        <div class="ev-meta">${esc(loc)}${organizer ? ' · ' + esc(organizer) : ''}${attendees ? ' · ' + esc(attendees) : ''}</div>
      </td>
    </tr>`;
}

/** Render day view: a single day's events as a table. */
function renderDay(date, events, getColor) {
  const dStr = fmtDate(date);
  const dayEvents = events.filter(e => e.date === dStr).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const heading = `${DAY_NAMES[date.getDay()]}, ${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
  if (!dayEvents.length) return `<h2>${heading}</h2><p class="empty">Không có lịch họp trong ngày.</p>`;
  return `<h2>${heading}</h2>
    <table class="ev-table"><tbody>${dayEvents.map(e => eventRow(e, getColor(e.companyId))).join('')}</tbody></table>`;
}

/** Render week view: each day as a section. */
function renderWeek(date, events, getColor) {
  const days = getWeekDays(date);
  const range = `${String(days[0].getDate()).padStart(2,'0')}/${String(days[0].getMonth()+1).padStart(2,'0')} – ${String(days[6].getDate()).padStart(2,'0')}/${String(days[6].getMonth()+1).padStart(2,'0')}/${days[6].getFullYear()}`;
  const sections = days.map(d => {
    const dStr = fmtDate(d);
    const dayEvents = events.filter(e => e.date === dStr).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const label = `${DAY_NAMES[d.getDay()]} ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
    const body = dayEvents.length
      ? `<table class="ev-table"><tbody>${dayEvents.map(e => eventRow(e, getColor(e.companyId))).join('')}</tbody></table>`
      : `<p class="empty">Trống lịch</p>`;
    return `<div class="week-day"><h3>${label}</h3>${body}</div>`;
  }).join('');
  return `<h2>Tuần ${range}</h2>${sections}`;
}

/** Render month view: a 7-column grid calendar. */
function renderMonth(date, events, getColor) {
  const year = date.getFullYear(), month = date.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const blanks = (new Date(year, month, 1).getDay() + 6) % 7;
  const header = ['T2','T3','T4','T5','T6','T7','CN'].map(d => `<th>${d}</th>`).join('');
  let cells = '';
  for (let i = 0; i < blanks; i++) cells += '<td class="blank"></td>';
  for (let day = 1; day <= daysInMonth; day++) {
    const dStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dayEvents = events.filter(e => e.date === dStr).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const evHtml = dayEvents.map(e => {
      const color = getColor(e.companyId);
      return `<div class="m-ev" style="border-left:3px solid ${color};color:${color};">${esc((e.time||'').split(':')[0])}h ${esc(e.title)}</div>`;
    }).join('');
    cells += `<td><div class="m-day">${day}</div>${evHtml}</td>`;
  }
  // Close rows every 7 cells
  const allCells = cells;
  // Wrap into rows
  const tdMatches = allCells.match(/<td[\s\S]*?<\/td>/g) || [];
  let rows = '';
  for (let i = 0; i < tdMatches.length; i += 7) {
    rows += `<tr>${tdMatches.slice(i, i + 7).join('')}</tr>`;
  }
  return `<h2>${MONTH_NAMES[month]} ${year}</h2>
    <table class="month-grid"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table>`;
}

/**
 * Open a print window with the calendar rendered for the given view/date.
 * @param {object} opts
 * @param {'day'|'week'|'month'} opts.viewMode
 * @param {Date} opts.date
 * @param {Array} opts.events  filtered events to print
 * @param {(companyId:string)=>string} opts.getColor
 * @param {string} opts.orgName  organization name for header
 * @param {string} opts.companyLabel  current company filter label
 */
export function printCalendar({ viewMode, date, events, getColor, orgName, companyLabel }) {
  let content = '';
  if (viewMode === 'day')   content = renderDay(date, events, getColor);
  if (viewMode === 'week')  content = renderWeek(date, events, getColor);
  if (viewMode === 'month') content = renderMonth(date, events, getColor);

  const printedAt = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">
<title>Lịch ${esc(orgName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 24px; }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #047857; padding-bottom: 12px; margin-bottom: 16px; }
  .doc-header h1 { font-size: 18px; margin: 0; color: #047857; }
  .doc-header .sub { font-size: 11px; color: #64748b; margin-top: 2px; }
  .doc-header .meta { font-size: 11px; color: #64748b; text-align: right; }
  h2 { font-size: 15px; margin: 12px 0 8px; }
  h3 { font-size: 12px; margin: 10px 0 4px; color: #334155; }
  .empty { color: #94a3b8; font-style: italic; font-size: 12px; }
  .ev-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .ev-table td { padding: 6px 8px; vertical-align: top; border-bottom: 1px solid #e2e8f0; }
  .ev-table .time { width: 90px; font-weight: bold; font-size: 12px; color: #475569; white-space: nowrap; }
  .ev-title { font-weight: 600; font-size: 13px; }
  .ev-meta { font-size: 11px; color: #64748b; margin-top: 2px; }
  .week-day { margin-bottom: 6px; }
  .month-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .month-grid th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 4px; font-size: 11px; }
  .month-grid td { border: 1px solid #cbd5e1; height: 80px; vertical-align: top; padding: 3px; }
  .month-grid td.blank { background: #f8fafc; }
  .m-day { font-weight: bold; font-size: 11px; text-align: right; color: #475569; }
  .m-ev { font-size: 9px; line-height: 1.3; padding: 1px 3px; margin-top: 2px; border-radius: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media print { body { margin: 12mm; } @page { size: ${viewMode === 'month' ? 'A4 landscape' : 'A4 portrait'}; } }
</style></head><body>
  <div class="doc-header">
    <div>
      <h1>${esc(orgName || 'Lịch Trình')}</h1>
      <div class="sub">${esc(companyLabel || 'Tất cả công ty')}</div>
    </div>
    <div class="meta">In lúc: ${esc(printedAt)}</div>
  </div>
  ${content}
  <script>window.onload = function(){ window.print(); }</script>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) { alert('Trình duyệt chặn cửa sổ in. Vui lòng cho phép pop-up.'); return; }
  win.document.write(html);
  win.document.close();
}

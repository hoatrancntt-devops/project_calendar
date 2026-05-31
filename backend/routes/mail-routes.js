const router = require('express').Router();
const db = require('../db');
const { sendMail, createTransporter } = require('../services/smtp-mail');
const { sendNewEventsEmail } = require('../services/calendar-sync');

// GET /api/mail/config — return non-sensitive fields only (no credentials)
router.get('/config', (req, res) => {
  const cfg = db.prepare('SELECT * FROM smtp_config WHERE id = 1').get() || {};
  res.json({
    configured: !!cfg.host,
    host:       cfg.host       || '',
    port:       cfg.port       || 587,
    secure:     !!cfg.secure,
    from_name:  cfg.from_name  || '',
    from_email: cfg.from_email || '',
    // auth_user and password intentionally omitted
  });
});

// POST /api/mail/config — save SMTP config
router.post('/config', (req, res) => {
  const { host, port, secure, auth_user, password, from_name, from_email } = req.body;
  const stmt = password && password !== '••••••'
    ? db.prepare('UPDATE smtp_config SET host=@host,port=@port,secure=@secure,auth_user=@auth_user,password=@password,from_name=@from_name,from_email=@from_email WHERE id=1')
    : db.prepare('UPDATE smtp_config SET host=@host,port=@port,secure=@secure,auth_user=@auth_user,from_name=@from_name,from_email=@from_email WHERE id=1');
  stmt.run({ host, port: Number(port) || 587, secure: secure ? 1 : 0, auth_user, password, from_name, from_email });
  res.json({ saved: true });
});

// POST /api/mail/test — send a test email
router.post('/test', async (req, res) => {
  const { to } = req.body;
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'Email không hợp lệ' });
  }
  try {
    await sendMail({
      to,
      subject: '[TEST] Hệ thống Lịch Trình — Kiểm tra SMTP',
      html: `<h2>✅ Kết nối SMTP thành công!</h2><p>Thời gian: <strong>${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</strong></p>`,
    });
    res.json({ sent: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mail/alert — send expiry alert for a specific company
// Accepts { companyId } — recipients and template rendered server-side
router.post('/alert', async (req, res) => {
  const { companyId } = req.body;
  if (!companyId) return res.status(400).json({ error: 'Thiếu companyId' });

  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
  if (!company) return res.status(404).json({ error: 'Công ty không tìm thấy' });

  const recipients = JSON.parse(company.expiry_alert_emails || '[]');
  if (!recipients.length) return res.status(400).json({ error: 'Công ty chưa có người nhận cảnh báo' });

  // Compute expiry status server-side
  const days = company.api_expiration_date
    ? Math.ceil((new Date(company.api_expiration_date) - new Date()) / 86400000)
    : null;
  const expired = days !== null && days < 0;
  const label   = expired ? 'đã hết hạn!' : days !== null ? `hết hạn trong ${days} ngày` : 'không xác định';
  const color   = expired ? '#b91c1c' : '#b45309';

  try {
    await sendMail({
      to: recipients,
      subject: `[CẢNH BÁO] API Microsoft 365 ${company.company_name} ${label}`,
      html: `
        <h2 style="color:#b91c1c;">⚠️ Cảnh báo hết hạn API Microsoft 365</h2>
        <table style="border-collapse:collapse;font-family:sans-serif;">
          <tr><td style="padding:6px 12px;font-weight:600;">Công ty:</td><td style="padding:6px 12px;">${company.company_name}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:600;">Ngày hết hạn:</td><td style="padding:6px 12px;">${company.api_expiration_date || 'Chưa cấu hình'}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:600;">Trạng thái:</td><td style="padding:6px 12px;color:${color};">${expired ? 'ĐÃ HẾT HẠN' : days !== null ? `Còn ${days} ngày` : 'Không xác định'}</td></tr>
        </table>
        <p style="margin-top:16px;">Vui lòng gia hạn hoặc cấp mới API credentials.</p>
      `,
    });
    res.json({ sent: true, recipients: recipients.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mail/test-notify — send a SAMPLE "new event" notification to a company's
// notify recipients. Recipients resolved server-side from DB (anti-relay). Lets the
// admin verify delivery without waiting for a genuinely new calendar event.
router.post('/test-notify', async (req, res) => {
  const { companyId } = req.body;
  if (!companyId) return res.status(400).json({ error: 'Thiếu companyId' });

  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(companyId);
  if (!company) return res.status(404).json({ error: 'Công ty không tìm thấy' });

  const recipients = JSON.parse(company.notify_emails || '[]');
  if (!recipients.length) {
    return res.status(400).json({ error: 'Công ty chưa có "Email Nhận Thông Báo Lịch". Thêm email và bấm Lưu trước.' });
  }

  // Sample event so the recipient sees the real notification format
  const now = new Date();
  const sample = [{
    date: now.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
    time: now.toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit' }),
    title: '[THỬ] Sự kiện kiểm tra thông báo',
    type: 'teams',
    room: '', location: 'Microsoft Teams',
  }];

  try {
    await sendNewEventsEmail(company, sample, recipients);
    res.json({ sent: true, recipients: recipients.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

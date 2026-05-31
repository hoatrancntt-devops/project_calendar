const nodemailer = require('nodemailer');
const db = require('../db');

/** Load SMTP config from DB and create a nodemailer transporter. */
function createTransporter() {
  const cfg = db.prepare('SELECT * FROM smtp_config WHERE id = 1').get();
  if (!cfg?.host) throw new Error('Chưa cấu hình SMTP. Vào Settings → Email để thiết lập.');

  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port || 587,
    secure: !!cfg.secure,
    auth: cfg.auth_user ? { user: cfg.auth_user, pass: cfg.password } : undefined,
  });
}

/**
 * Send an email via configured SMTP.
 * @param {{ to: string|string[], subject: string, html: string }} opts
 */
async function sendMail({ to, subject, html }) {
  const cfg = db.prepare('SELECT * FROM smtp_config WHERE id = 1').get() || {};

  // Route via Microsoft Graph Mail.Send when selected (avoids SMTP basic-auth flakiness)
  if (cfg.mail_provider === 'graph') {
    const { sendMailViaGraph } = require('./graph-mail');
    return sendMailViaGraph({ cfg, to, subject, html });
  }

  const transporter = createTransporter();
  const from        = cfg.from_name
    ? `"${cfg.from_name}" <${cfg.from_email}>`
    : cfg.from_email;

  try {
    await transporter.sendMail({
      from,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
    });
  } catch (err) {
    // Translate common OpenSSL/nodemailer errors to actionable messages
    if (err.message?.includes('wrong version number')) {
      throw new Error(`Lỗi SSL: Port ${cfg.port} không hỗ trợ SSL trực tiếp. Dùng port 465 (SSL) hoặc tắt SSL để dùng port 587 (STARTTLS).`);
    }
    if (err.code === 'EAUTH') {
      throw new Error(`Xác thực SMTP thất bại: Kiểm tra lại email/mật khẩu. Gmail cần dùng App Password, không dùng mật khẩu thường.`);
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      throw new Error(`Không kết nối được SMTP server "${cfg.host}:${cfg.port}". Kiểm tra lại host và port.`);
    }
    throw err;
  }
}

module.exports = { sendMail, createTransporter };

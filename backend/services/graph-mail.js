const axios = require('axios');
const { getToken } = require('./graph-auth');

/**
 * Send an email via Microsoft Graph `sendMail` (application permission Mail.Send).
 * Robust alternative to SMTP basic auth (which Microsoft is deprecating).
 *
 * Requires in smtp_config: graph_tenant_id, graph_client_id, graph_client_secret,
 * and from_email (the sender mailbox in that tenant, e.g. system@hlv.vn).
 *
 * @param {{ cfg: object, to: string|string[], subject: string, html: string }} opts
 */
async function sendMailViaGraph({ cfg, to, subject, html }) {
  const sender = cfg.from_email;
  if (!cfg.graph_tenant_id || !cfg.graph_client_id || !cfg.graph_client_secret || !sender) {
    throw new Error('Chưa cấu hình Graph Mail: cần Tenant ID, Client ID, Client Secret và Email gửi (from_email).');
  }

  const token = await getToken(cfg.graph_tenant_id, cfg.graph_client_id, cfg.graph_client_secret);
  const toRecipients = (Array.isArray(to) ? to : [to])
    .filter(Boolean)
    .map(addr => ({ emailAddress: { address: addr } }));

  try {
    await axios.post(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
      {
        message: {
          subject,
          body: { contentType: 'HTML', content: html },
          toRecipients,
          ...(cfg.from_name ? { from: { emailAddress: { name: cfg.from_name, address: sender } } } : {}),
        },
        saveToSentItems: false,
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.error?.message || err.message;
    // Common: 403 = missing Mail.Send app permission / admin consent; 404 = sender mailbox not found
    throw new Error(`Graph sendMail ${status || ''}: ${detail}`);
  }
}

module.exports = { sendMailViaGraph };

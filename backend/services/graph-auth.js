const axios = require('axios');

/** In-memory token cache keyed by "tenantId:clientId". */
const tokenCache = new Map();

/**
 * Get an app-only access token via client_credentials flow.
 * Caches result until 60 seconds before expiry.
 */
async function getToken(tenantId, clientId, clientSecret) {
  const key    = `${tenantId}:${clientId}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  let data;
  try {
    ({ data } = await axios.post(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        scope:         'https://graph.microsoft.com/.default',
        grant_type:    'client_credentials',
      }),
    ));
  } catch (err) {
    const azureErr = err.response?.data;
    const detail   = azureErr?.error_description || azureErr?.error || err.message;
    console.error(`[auth] Token request failed (${tenantId}/${clientId}): ${detail}`);
    throw new Error(`Azure AD 401: ${detail}`);
  }

  tokenCache.set(key, {
    token:     data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });

  return data.access_token;
}

module.exports = { getToken };

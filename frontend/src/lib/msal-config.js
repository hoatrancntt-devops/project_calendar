/** Build MSAL PublicClientApplication config from adminSettings. */
export function buildMsalConfig(adminSettings) {
  const clientId = adminSettings?.msClientId || '';
  const tenantId = adminSettings?.msTenantId || 'common';
  return {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: 'localStorage', // persists across tabs/reloads; expires only on MS365 password change
      storeAuthStateInCookie: false,
    },
  };
}

/** Scopes requested at login — User.Read for identity, Mail.Send for sending alerts. */
export const LOGIN_SCOPES = ['User.Read', 'Mail.Send'];

/**
 * Attempt a silent token refresh using MSAL's cached session.
 * Returns new access token, or throws if session is gone (user must re-login).
 */
export async function silentRefreshToken(msalInstance, scopes = LOGIN_SCOPES) {
  const accounts = msalInstance?.getAllAccounts?.() ?? [];
  if (!accounts.length) throw new Error('Phiên Microsoft đã hết hạn. Vui lòng đăng nhập lại.');
  const result = await msalInstance.acquireTokenSilent({ account: accounts[0], scopes });
  return result.accessToken;
}

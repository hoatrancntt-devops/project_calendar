/** Call Microsoft Graph API with a delegated access token. */
export async function graphFetch(accessToken, path, options = {}) {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Graph API ${res.status}: ${errText || res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

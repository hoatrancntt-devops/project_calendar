// Return the URL only if it uses an http(s) scheme; otherwise null.
// Defense-in-depth against XSS via javascript:/data: hrefs (backend also validates).
export function safeHttpUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return (u.protocol === 'https:' || u.protocol === 'http:') ? u.toString() : null;
  } catch {
    return null;
  }
}

export const EXPIRY_DEFAULTS = { warningDays: 30, criticalDays: 7 };

/** Days remaining until an ISO date string expires. Returns null if no date. */
export function daysUntilExpiry(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
}

/** Classify expiry days into a status string. Accepts optional threshold overrides. */
export function expiryStatus(days, thresholds = EXPIRY_DEFAULTS) {
  if (days === null) return 'unknown';
  if (days < 0)   return 'expired';
  if (days <= thresholds.criticalDays) return 'critical';
  if (days <= thresholds.warningDays)  return 'warning';
  return 'ok';
}

// NSE market-hours check for the mobile client.
//
// Deliberately avoids `date.toLocaleString(..., { timeZone: 'Asia/Kolkata' })`
// followed by re-parsing the result with `new Date(string)`. That round-trip
// depends on the JS engine having full ICU/timezone data (Hermes builds don't
// always ship it) and on the engine's non-standard locale-string date parser
// — when either is missing/inconsistent it silently yields `Invalid Date`,
// so every field read off it is NaN and every comparison is false, which
// makes the market look permanently "closed" even during trading hours.
// Plain UTC-offset arithmetic has no such dependency.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// `Date.now()` / `date.getTime()` is always an absolute UTC instant in JS —
// local device timezone never affects it. So getting "IST wall-clock
// components" only needs a flat +5:30 shift, then reading the *UTC* fields
// off the shifted timestamp (NOT the local getHours()/getDay(), which would
// re-apply the device's own timezone on top and double-shift the result).
export function getIstNow() {
  return new Date(Date.now() + IST_OFFSET_MS);
}

export function isMarketOpen() {
  const ist = getIstNow();
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 30;
}

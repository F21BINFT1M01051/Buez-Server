/**
 * Shared device / platform detection helpers.
 *
 * Two functions with different granularity:
 *   - classifyPlatform(ua): routing decision  -> 'android' | 'ios' | 'ipad' | 'desktop' | 'unknown'
 *   - getDeviceType(ua):     analytics bucket  -> 'mobile'  | 'tablet' | 'desktop'
 *
 * Kept dependency-free (pure UA regex) so it runs on both Node and Edge runtimes.
 */

/**
 * Classify the requesting platform for redirect routing.
 *
 * Notes / known edge cases:
 *  - iPadOS 13+ Safari reports a desktop ("Macintosh") UA by default, so such
 *    iPads are classified as 'desktop'. There is no reliable server-side signal
 *    to distinguish them (touch detection is client-only). Older iPads and
 *    in-app webviews that still send "iPad" are caught as 'ipad'.
 *  - Order matters: Android must be checked before generic mobile/mac checks.
 *
 * @param {string} userAgent
 * @returns {'android'|'ios'|'ipad'|'desktop'|'unknown'}
 */
function classifyPlatform(userAgent) {
  const ua = (userAgent || "").toLowerCase();

  if (!ua) return "unknown";

  // Android (phones + tablets) -> Play Store
  if (/android/.test(ua)) return "android";

  // iPhone / iPod -> App Store
  if (/iphone|ipod/.test(ua)) return "ios";

  // Explicit iPad (older iPadOS / webviews still send this) -> App Store
  if (/ipad/.test(ua)) return "ipad";

  // Known desktop operating systems -> landing page
  if (/windows nt|macintosh|mac os x|cros|linux|x11/.test(ua)) return "desktop";

  return "unknown";
}

/**
 * Coarse device bucket for analytics. Mirrors the original getDeviceType
 * that previously lived inside api/[shortCode].js (behaviour preserved).
 *
 * @param {string} userAgent
 * @returns {'mobile'|'tablet'|'desktop'}
 */
function getDeviceType(userAgent) {
  const ua = userAgent || "";
  if (/mobile/i.test(ua)) return "mobile";
  if (/tablet/i.test(ua)) return "tablet";
  return "desktop";
}

module.exports = { classifyPlatform, getDeviceType };

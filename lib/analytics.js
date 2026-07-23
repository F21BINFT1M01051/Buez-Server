/**
 * Fire-and-forget analytics for the smart-download QR endpoint.
 *
 * Writes one document per scan to the `qrScans` Firestore collection.
 * A dedicated collection (rather than the existing `clickAnalytics`, which is
 * keyed by share-link shortCode) keeps QR scan data clean and independently
 * queryable.
 *
 * IMPORTANT: callers must NOT await this. Invoke and attach a .catch so a
 * Firestore hiccup can never delay or break the user's redirect.
 */

const { admin, db } = require("../firebaseAdmin");
const { getDeviceType } = require("./deviceDetect");

// Strip ASCII control chars (0x00-0x1F and 0x7F). Built via RegExp to avoid
// embedding literal control bytes in the source file.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp("[\\x00-\\x1F\\x7F]", "g");

/** Trim + strip control chars, cap length. Defensive against log injection. */
function sanitizeString(value, maxLength = 512) {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL_CHARS, "").trim().slice(0, maxLength);
}

function safeDecode(value) {
  if (typeof value !== "string") return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** First hop of X-Forwarded-For, sanitized. */
function extractClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  const raw = Array.isArray(fwd) ? fwd[0] : (fwd || "").split(",")[0];
  return sanitizeString(raw, 64);
}

/**
 * Log a QR scan. Fire-and-forget.
 *
 * @param {import('http').IncomingMessage} req
 * @param {{ platform: string }} meta - resolved platform from classifyPlatform
 * @returns {Promise<void>}
 */
async function logQrScan(req, meta) {
  const userAgent = req.headers["user-agent"] || "";

  const record = {
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    platform: sanitizeString(meta.platform, 20), // ios | ipad | android | desktop | unknown
    deviceType: getDeviceType(userAgent), // mobile | tablet | desktop
    userAgent: sanitizeString(userAgent, 512),
    referrer: sanitizeString(req.headers["referer"], 512),
    ip: extractClientIp(req),
    country: sanitizeString(req.headers["x-vercel-ip-country"], 8),
    // Vercel URL-encodes the city header (e.g. "New%20York")
    city: sanitizeString(safeDecode(req.headers["x-vercel-ip-city"]), 128),
    region: sanitizeString(req.headers["x-vercel-ip-country-region"], 16),
  };

  await db.collection("qrScans").add(record);
}

module.exports = { logQrScan, sanitizeString };

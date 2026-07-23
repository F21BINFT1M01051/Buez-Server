/**
 * GET /get — Universal smart-download redirect.
 *
 * One permanent URL (https://<domain>/get) is encoded into a single QR code
 * used everywhere. This endpoint resolves the destination at request time so
 * the QR never has to change:
 *
 *   iOS / iPad -> IOS_STORE_URL       (Apple App Store)
 *   Android    -> ANDROID_STORE_URL   (Google Play Store)
 *   Desktop /  -> DESKTOP_FALLBACK_URL (landing page)
 *   Unknown
 *
 * Store URLs live only in environment variables — never inside the QR.
 *
 * Security: the redirect target is chosen exclusively from a fixed set of
 * env-configured URLs. No request input is ever used to build the target, so
 * there is no open-redirect surface. Each target is still validated to be an
 * absolute https URL before use (defence in depth).
 */

const { classifyPlatform } = require("../lib/deviceDetect");
const { logQrScan } = require("../lib/analytics");

/** Only allow absolute https URLs as redirect targets. */
function isSafeHttpsUrl(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Resolve the destination URL for a platform from environment config. */
function resolveTarget(platform) {
  const iosUrl = process.env.IOS_STORE_URL;
  const androidUrl = process.env.ANDROID_STORE_URL;
  const desktopUrl = process.env.DESKTOP_FALLBACK_URL;

  switch (platform) {
    case "ios":
    case "ipad":
      return iosUrl;
    case "android":
      return androidUrl;
    case "desktop":
    case "unknown":
    default:
      return desktopUrl;
  }
}

module.exports = async (req, res) => {
  // Only GET/HEAD are meaningful for a QR scan.
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const userAgent = req.headers["user-agent"] || "";
  const platform = classifyPlatform(userAgent);

  // Resolve destination, with a safe fallback chain if a var is missing/invalid.
  let target = resolveTarget(platform);
  if (!isSafeHttpsUrl(target)) {
    const fallback = process.env.DESKTOP_FALLBACK_URL;
    if (isSafeHttpsUrl(fallback)) {
      target = fallback;
    } else {
      // Misconfiguration — never 302 to an untrusted/empty value.
      console.error(
        `[/get] No valid redirect target. platform=${platform} ` +
          `IOS_STORE_URL/ANDROID_STORE_URL/DESKTOP_FALLBACK_URL misconfigured.`
      );
      return res
        .status(500)
        .send("Download is temporarily unavailable. Please try again later.");
    }
  }

  // Fire-and-forget analytics — must not delay the redirect.
  logQrScan(req, { platform }).catch((err) =>
    console.error("[/get] analytics write failed:", err)
  );

  // Device-specific decision: never cache at CDN/browser or one device's
  // redirect could be served to another.
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");

  // 302 Temporary — lets us change destinations later without stale caches.
  res.statusCode = 302;
  res.setHeader("Location", target);
  return res.end();
};

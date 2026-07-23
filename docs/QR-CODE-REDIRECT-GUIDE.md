# Buez — Dynamic QR Code & Smart Redirect: Architecture & Setup Plan

> Planning document only. No code is deployed by this guide. It maps the feature onto your **existing** Vercel + Firebase server.

## TL;DR / Recommendation

Build **one dedicated, server-side redirect endpoint** on your existing Vercel server (`/get`). The QR encodes a single, permanent URL pointing at that endpoint. The endpoint reads the `User-Agent` server-side and issues an HTTP **302** redirect to the App Store, Play Store, or landing/interstitial page. Store URLs live in **environment variables**, so the QR never changes even if store URLs do.

You do **not** need Firebase Dynamic Links (shut down **August 25, 2025** — dead), Branch, or AppsFlyer for this. Those are only justified later if you need **paid-acquisition attribution** or **deferred deep linking** (carry a specific job/context through install). Your repo already contains ~90% of the needed infrastructure.

---

## What you already have (reused, not rebuilt)

Your server (`buez-server-khaki.vercel.app`) already implements the hard parts:

- **`api/[shortCode].js`** — dynamic per-link route with `getDeviceType()` UA detection, Firestore click tracking, and Vercel geo headers (`x-vercel-ip-country`, `x-vercel-ip-city`).
- **`clickAnalytics`** Firestore collection — timestamp, userAgent, referrer, ip, country, city, device. This is exactly the analytics schema the QR feature needs.
- **`public/.well-known/apple-app-site-association`** + **`assetlinks.json`** — Universal Links / App Links already verified for `com.adamburg.Buez` (Team `34G27X37J4`) and `com.adamburg.buez`. This is what enables deferred/direct deep linking later.
- **`firebaseAdmin.js`** — Admin SDK + Firestore instance.
- Config constants already known: iOS app id `6753902802`, Android package `com.adamburg.buez`, TestFlight `useTestFlight: true`, url scheme `buez://`.

The QR redirect is a **simpler, static sibling** of `[shortCode].js`: same detection + analytics pattern, but with a fixed destination instead of a per-job document.

---

## 1. Overall architecture & request flow

```
                         ┌──────────────────────────────────────────────┐
   Poster / business     │  QR encodes ONE permanent URL:                │
   card / landing page   │  https://buez-server-khaki.vercel.app/get     │
        │                └──────────────────────────────────────────────┘
        │ scan
        ▼
   Phone/desktop browser ──── GET /get ────►  Vercel Edge/Serverless
                                                      │
                                          api/get.js (or [shortCode] pattern)
                                                      │
                                    1. Read User-Agent + Vercel geo headers
                                    2. Classify: iOS | Android | desktop | bot
                                    3. Fire-and-forget analytics write (Firestore)
                                    4. Decide destination
                                                      │
                    ┌─────────────────────────────────┼─────────────────────────────────┐
                    ▼                                  ▼                                 ▼
             iOS detected                      Android detected                  Desktop / unknown
        302 → App Store / TestFlight      302 → Play Store listing        302 → landing page  OR
        (apps.apple.com/id6753902802)     (play.google.com/...=com...)    200 → interstitial with
                                                                          both download buttons + QR
```

Key decisions embedded above:

- **Redirect happens server-side (302)**, not via client-side JS. Faster, works even with JS disabled, and social/link-preview crawlers behave predictably. (Your `[shortCode].js` uses client-side JS because it also needs to *attempt a deep link into an installed app*; the plain download QR does not, so server-side 302 is cleaner.)
- **Analytics write is non-blocking** — never make the user wait on Firestore before redirecting.
- **Bots/crawlers** (Slack, WhatsApp, Facebook, Twitter/X unfurlers) should get the interstitial HTML with OG tags, *not* a 302 into a store, so link previews render.

---

## 2. How the QR is generated & what URL it points to

**The QR encodes a single, permanent, human-readable URL** — nothing else. Recommended:

```
https://buez-server-khaki.vercel.app/get
```

(or a marketing-friendly path like `/download` or `/app`; pick one and keep it forever.)

Rules that keep it permanent (see §9):

- The QR image encodes only the URL string. It contains **zero** store links. Those resolve server-side at scan time.
- Never bake `apps.apple.com/...` or `play.google.com/...` directly into a QR — if Apple/Google ever change a URL format or you rebrand the bundle id, every printed poster breaks.
- Add campaign tracking with query params **without** changing the base, e.g. `/get?src=poster`, `/get?src=businesscard`, `/get?src=casestudy`. Different QR images, same endpoint, per-source analytics.

**Generating the image** — this is a one-off design task, not server code:

- Any QR generator (e.g. the `qrcode` npm package, an online generator, or a design tool) produces a PNG/SVG from the URL string.
- Use **high error-correction level (H)** so the code still scans with a center logo overlay and survives print smudging.
- Export **SVG** for print (infinite scale on posters) and **PNG** (≥1024px) for web/social.
- Optionally add a tiny optional CLI/script later (`scripts/generate-qr.js`) so you can regenerate branded variants per campaign — but this is not required and not part of the server runtime.

---

## 3. How Vercel detects Android / iOS / desktop

Server-side, from request headers Vercel already provides — no library strictly required, but `ua-parser-js` is recommended for robustness over hand-rolled regex.

Signals available on every request:

| Signal | Header | Notes |
|---|---|---|
| Device/OS | `user-agent` | Primary classification source |
| Country | `x-vercel-ip-country` | Vercel-injected geo (already used in your code) |
| City / region | `x-vercel-ip-city`, `x-vercel-ip-country-region` | Vercel-injected geo |
| Client IP | `x-forwarded-for` | First IP in the list |

Classification logic (concept, mirrors your existing `getDeviceType`, extended):

```
ua = headers['user-agent']
isIOS      = /iPad|iPhone|iPod/i          AND not Windows      (also treat iPadOS Safari that reports as Mac + touch)
isAndroid  = /Android/i
isBot      = /bot|crawler|spider|facebookexternalhit|slackbot|whatsapp|twitterbot|linkedinbot|discordbot|telegrambot/i
isDesktop  = not iOS and not Android and not bot
```

Edge cases to handle explicitly:

- **iPadOS** Safari can identify as `Macintosh`. If you want iPads → App Store, add a touch/platform heuristic or accept them into the desktop interstitial (safer default).
- **In-app browsers** (Instagram/Facebook/TikTok webviews) — your `[shortCode].js` already detects these; the download QR mostly doesn't need the deep-link warning, but keep a bot check so unfurlers don't inflate scan counts.
- **Unknown/empty UA** → desktop interstitial (safe fallback).

Prefer running this on **Vercel Edge** or a lightweight Node serverless function; the geo headers are populated in both.

---

## 4. Solution comparison & recommendation

| Option | What it is | Pros | Cons | Fit for Buez now |
|---|---|---|---|---|
| **Custom redirect endpoint** (recommended) | Your own `/get` route on Vercel doing UA sniff + 302 | Zero new vendor/cost; full control of analytics (already in Firestore); QR never changes; reuses existing code & `.well-known` files; no SDK in the app | You maintain it (minimal); no built-in *deferred* deep link (carrying context through install) — but you don't need that for a generic "download the app" QR | ✅ **Best. Ship this.** |
| **Firebase Dynamic Links** | Google's smart-URL service | — | **Shut down Aug 25, 2025. Fully dead — all links return 404.** Not an option. | ❌ Impossible |
| **Branch.io** | Deep-linking + attribution platform | Deferred deep linking, install attribution, dashboards, A/B; generous-ish free tier | New SDK in the app; vendor lock-in; overkill for a static download QR; privacy/consent overhead | ⚠️ Only if you later need paid-UA attribution / deferred context |
| **AppsFlyer** | Mobile measurement / attribution (MMP) | Best-in-class paid-acquisition attribution, fraud protection, integrations | Paid, enterprise-oriented; heavier SDK; more than you need for organic QR | ⚠️ Only at ad-spend scale |
| **Adjust / Singular / Kochava / Bitly** | Same MMP/link category as above | Similar to Branch/AppsFlyer | Same cost/complexity tradeoff | ⚠️ Same as above |

**Recommendation:** custom endpoint now. Revisit Branch/AppsFlyer **only** when you start paying for user acquisition and need to attribute installs to campaigns, or need a scanned poster to drop the user into a *specific* screen after a fresh install (deferred deep link). Even then, your Universal/App Links foundation means direct deep linking (§7) is already free.

---

## 5. Structuring the redirect endpoint

Fits your existing `api/*.js` + `vercel.json` routing pattern.

**Route (add to `vercel.json` `routes`, before the 8-char catch-all so it isn't swallowed):**

```jsonc
{ "src": "/get", "dest": "/api/get.js", "methods": ["GET", "HEAD"] }
```

> Order matters: your current `"/([a-zA-Z0-9]{8})"` catch-all would treat a longer path differently, but a fixed `/get` is safe. Keep `/get` (3 chars) distinct from the 8-char shortCode pattern.

**Endpoint responsibilities (`api/get.js`) — pseudocode, not final code:**

```
export default async (req, res) => {
  const ua      = req.headers['user-agent'] || '';
  const src     = req.query.src || 'direct';          // campaign tag
  const country = req.headers['x-vercel-ip-country'] || '';

  const platform = classify(ua);                       // 'ios' | 'android' | 'desktop' | 'bot'

  // 1. Non-blocking analytics (do NOT await before redirect)
  logScan({ platform, src, ua, country, ... }).catch(console.error);

  // 2. Bots → interstitial HTML with OG tags (good link previews), no store redirect
  if (platform === 'bot') return sendInterstitial(res, { forPreview: true });

  // 3. Humans → destination
  const IOS = process.env.IOS_STORE_URL;               // apps.apple.com/app/id6753902802
  const AND = process.env.ANDROID_STORE_URL;           // play.google.com/store/apps/details?id=com.adamburg.buez
  const WEB = process.env.DESKTOP_FALLBACK_URL;        // landing page

  if (platform === 'ios')     return redirect302(res, IOS);
  if (platform === 'android') return redirect302(res, AND);
  return sendInterstitial(res, { ios: IOS, android: AND, web: WEB });  // desktop: buttons for both
};
```

Notes:

- Use **302 (temporary)**, not 301 — you want the ability to change destinations without cached permanent redirects sticking in browsers.
- Set `Cache-Control: no-cache` on the redirect response so device-specific decisions are never cached by a shared CDN layer (see §8).
- Keep store URLs in **env vars** (`IOS_STORE_URL`, `ANDROID_STORE_URL`, `DESKTOP_FALLBACK_URL`, plus `USE_TESTFLIGHT` / `IOS_TESTFLIGHT_URL` to mirror your current TestFlight behavior). This is the mechanism that makes the QR permanent (§9).

---

## 6. Analytics tracking

Reuse your existing `clickAnalytics` Firestore collection (or a parallel `qrScans` collection to keep QR data separate). Every scan writes one document:

```jsonc
// collection: qrScans (mirrors your clickAnalytics shape + campaign fields)
{
  "timestamp":  serverTimestamp(),          // when
  "platform":   "ios" | "android" | "desktop" | "bot",
  "device":     "mobile" | "tablet" | "desktop",   // your getDeviceType()
  "src":        "poster" | "businesscard" | "casestudy" | "direct",  // from ?src=
  "userAgent":  req.headers['user-agent'],
  "referrer":   req.headers['referer'] || "",
  "ip":         req.headers['x-forwarded-for'],
  "country":    req.headers['x-vercel-ip-country'],
  "city":       req.headers['x-vercel-ip-city'],
  "region":     req.headers['x-vercel-ip-country-region']
}
```

Metrics you can then derive:

- **Total scans** — document count.
- **iOS vs Android vs desktop** — group by `platform`.
- **By campaign/source** — group by `src` (which poster/card/page performs best).
- **Geography** — group by `country` / `city`.
- **Time series** — bucket `timestamp` by hour/day for trend charts.
- **Optional conversion** — if you later log installs/opens with the same `src`, you can compute scan→install funnels.

Analytics best practices:

- **Fire-and-forget**: write asynchronously; never block the redirect on Firestore.
- **Aggregate for dashboards**: raw per-scan writes are fine at low volume, but for a live dashboard add a scheduled Cloud Function (or a daily aggregation doc) that rolls counts into `qrStats/{date}` so reads are cheap. Firestore charges per document read — don't scan the whole collection on every dashboard load.
- **Respect privacy**: IP + geo is personal data in some jurisdictions. Consider truncating/hashing IP, and document retention in your privacy policy (§8).
- Optionally forward events to **Google Analytics 4 / BigQuery** if you want richer BI later, but Firestore alone is enough to start.

---

## 7. Extending to deep linking after install

You are already set up for this — the `.well-known` files are verified. Two layers:

**Direct deep linking (works today):**
- iOS **Universal Links** via `apple-app-site-association` (`/job/*`, `/*` paths, `com.adamburg.Buez`) and Android **App Links** via `assetlinks.json` (`com.adamburg.buez`) are already configured.
- If the app is installed, a Universal/App Link URL opens the app directly on the right screen; if not, it falls to the browser (your endpoint). This is exactly the pattern `[shortCode].js` already leans on (`al:ios:url`, `buez://job/{id}`).
- To extend the QR feature: point campaign links at path-based URLs your app claims (e.g. `/promo/summer`) and add route handling in the RN app's linking config so those open the corresponding screen.

**Deferred deep linking (carry context *through* a fresh install):**
- Requirement: user scans → installs → app opens on the *specific* content from the QR (e.g. a promo, a referral, a specific job).
- The OS does **not** natively preserve this across App Store/Play Store install. This is the one thing FDL used to do.
- Options, cheapest first:
  1. **Play Install Referrer API** (Android) + a **fingerprint/clipboard match** (iOS) implemented yourself — works, more effort.
  2. **Branch.io / AppsFlyer OneLink** — buy the deferred-deep-link + attribution as a managed feature. Recommended if this becomes a real product need.
- **Recommendation:** ship the generic QR now with direct deep linking; only adopt Branch/AppsFlyer if/when deferred context becomes a requirement.

---

## 8. Security, caching & best practices

**Security**
- **Whitelist redirect targets.** The endpoint must only ever redirect to your fixed env-var store URLs. Never redirect to a value taken from a query param (open-redirect risk). If you add `?next=`, validate it against an allowlist.
- **No secrets client-side.** Store URLs and config stay in Vercel env vars; nothing sensitive is in the QR or HTML.
- **Sanitize inputs.** `src` and any query params must be sanitized before being written to Firestore or reflected in HTML (prevent stored/reflected XSS in the interstitial — your `[shortCode].js` currently interpolates Firestore strings into HTML; apply escaping there and in any new interstitial).
- **Rate-limit / bot-filter analytics** so crawlers and scrapers don't inflate scan counts (you already have a bot regex pattern to build on).
- **PII/geo compliance.** IP + location is regulated (GDPR/CCPA). Truncate or hash IP, set a Firestore TTL policy for raw scan docs, and mention QR analytics in your privacy policy.
- **`.well-known` integrity.** Keep AASA/assetlinks served as `application/json` (already routed) and never behind auth or redirects — Apple/Google fetch them unauthenticated.

**Caching**
- Redirect responses: `Cache-Control: no-cache, no-store` (or very short `s-maxage`). The response is device-specific; you must not let a CDN cache one device's redirect and serve it to another. Your `[shortCode].js` already sets `no-cache` — do the same here.
- Static QR **images** (if you host any): cache aggressively (`max-age=31536000, immutable`) — the image content is permanent.
- The interstitial HTML for desktop can be lightly cached (`s-maxage=60`) since it isn't device-branching to a store.

**General**
- Prefer **Edge runtime** for the redirect (lower latency, geo headers still present).
- Add lightweight logging/alerting so a broken store URL surfaces fast.
- Keep a `HEAD` handler so uptime monitors and some scanners work.

---

## 9. Making the QR permanent even if store URLs change

The single rule: **the QR encodes your endpoint URL, never a store URL.**

- Store URLs (`IOS_STORE_URL`, `ANDROID_STORE_URL`, `IOS_TESTFLIGHT_URL`, `DESKTOP_FALLBACK_URL`, `USE_TESTFLIGHT`) live in **Vercel environment variables**, read at request time.
- If Apple/Google change a URL, you rebrand the bundle id, you graduate off TestFlight to the public App Store, or you switch the desktop fallback page → **update the env var and redeploy. Every printed poster and business card keeps working. The QR image is never reprinted.**
- Never hardcode store URLs in the QR, and avoid hardcoding them in source; env vars keep them swappable and out of git.
- Keep the endpoint **path** (`/get`) stable forever — treat it as a permanent public contract. Version behind it, not the path.

---

## 10. Project folder structure & backend flow

Additions to your existing repo (nothing removed; follows current conventions):

```
Buez-Server/
├── api/
│   ├── [shortCode].js          # existing — per-job share links (unchanged)
│   ├── share.js                # existing — create share link (unchanged)
│   ├── get.js                  # NEW — the QR smart-redirect endpoint (§5)
│   └── ...                      # existing stripe/notification routes
├── lib/                         # NEW (optional) — extract shared helpers
│   ├── deviceDetect.js         #   classify(ua) → ios|android|desktop|bot  (generalize existing getDeviceType)
│   ├── analytics.js            #   logScan(...) → writes qrScans doc (non-blocking)
│   └── storeConfig.js          #   reads env vars → { iosUrl, androidUrl, webUrl, useTestFlight }
├── public/
│   ├── .well-known/
│   │   ├── apple-app-site-association   # existing — Universal Links (unchanged)
│   │   └── assetlinks.json              # existing — App Links (unchanged)
│   └── qr/                     # NEW (optional) — hosted QR image assets (svg/png)
├── scripts/
│   └── generate-qr.js          # NEW (optional) — regenerate branded QR variants per campaign
├── firebaseAdmin.js            # existing — reused for Firestore writes
├── vercel.json                 # MODIFIED — add /get route (§5)
└── docs/
    └── QR-CODE-REDIRECT-GUIDE.md   # this document
```

**End-to-end backend flow:**

1. Marketing places the QR (encoding `https://buez-server-khaki.vercel.app/get?src=<campaign>`) on posters, cards, landing/case-study pages, social.
2. User scans → browser issues `GET /get?src=...`.
3. `vercel.json` routes to `api/get.js`.
4. `get.js` reads `user-agent` + Vercel geo headers → `lib/deviceDetect.classify()`.
5. `lib/analytics.logScan()` writes a `qrScans` doc (fire-and-forget).
6. `lib/storeConfig` supplies destinations from env vars.
7. Decision:
   - iOS → 302 to App Store / TestFlight
   - Android → 302 to Play Store
   - Desktop → interstitial HTML (both buttons + optionally the QR) **or** 302 to landing page
   - Bot → interstitial with OG tags (no store redirect) for clean link previews
8. Later: dashboard/scheduled function aggregates `qrScans` into `qrStats/{date}` for reporting.

**Environment variables to add in Vercel:**

```
IOS_STORE_URL=https://apps.apple.com/app/id6753902802
IOS_TESTFLIGHT_URL=https://testflight.apple.com/join/ZcR7R163
USE_TESTFLIGHT=true
ANDROID_STORE_URL=https://play.google.com/store/apps/details?id=com.adamburg.buez
DESKTOP_FALLBACK_URL=https://<your-landing-page>
```

---

## Suggested build order (when you implement)

1. Add env vars in Vercel.
2. Extract `lib/deviceDetect.js` from your existing `getDeviceType` and generalize to `ios|android|desktop|bot`.
3. Create `api/get.js` (302 logic + interstitial) and add the `/get` route to `vercel.json`.
4. Add `lib/analytics.js` writing to `qrScans` (non-blocking).
5. Generate the QR (SVG for print, PNG for web, error-correction H, optional logo).
6. Test matrix: real iPhone (Safari + in-app), real Android (Chrome + in-app), desktop Chrome/Safari, and a link-preview crawler (paste the URL in Slack/WhatsApp).
7. Add a Firestore aggregation + simple dashboard when volume grows.
```

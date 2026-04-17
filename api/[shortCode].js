const { admin } = require("../firebaseAdmin");
const { db } = require("../firebaseAdmin");

const APP_CONFIG = {
  urlScheme: "buez",
  iosAppId: "6753902802",
  iosTestFlightUrl: "https://testflight.apple.com/join/ZcR7R163",
  androidPackage: "com.adamburg.Buez",
  appName: "Buez",
  useTestFlight: true,
};

async function trackClick(shortCode, req) {
  try {
    const linkRef = db.collection("shareLinks").doc(shortCode);
    await linkRef.update({
      clicks: admin.firestore.FieldValue.increment(1),
      lastClickedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastIp: req.headers["x-forwarded-for"] || req.connection.remoteAddress,
    });
    try {
      const analyticsRef = db.collection("clickAnalytics").doc();
      await analyticsRef.set({
        shortCode,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        userAgent: req.headers["user-agent"] || "",
        referrer: req.headers.referer || "",
        ip: req.headers["x-forwarded-for"] || req.connection.remoteAddress,
        country: req.headers["x-vercel-ip-country"] || "",
        city: req.headers["x-vercel-ip-city"] || "",
        device: getDeviceType(req.headers["user-agent"]),
      });
    } catch (analyticsError) {
      console.error("Analytics logging failed:", analyticsError);
    }
  } catch (error) {
    console.error("Error tracking click:", error);
  }
}

function getDeviceType(userAgent) {
  const ua = userAgent || "";
  if (/mobile/i.test(ua)) return "mobile";
  if (/tablet/i.test(ua)) return "tablet";
  return "desktop";
}

module.exports = async (req, res) => {
  const shortCode =
    req.query.shortCode || req.query.shortcode || req.params?.shortCode;

  if (!shortCode) {
    return sendErrorPage(res, "Invalid Link", "The link is missing a code.");
  }

  try {
    const linkDoc = await db.collection("shareLinks").doc(shortCode).get();

    if (!linkDoc.exists) {
      return sendErrorPage(res, "Link Not Found", "This share link has expired or doesn't exist.");
    }

    const data = linkDoc.data();
    const now = new Date();

    if (!data.isActive) {
      return sendErrorPage(res, "Link Deactivated", "This share link has been deactivated.");
    }

    if (data.expiresAt && data.expiresAt.toDate() < now) {
      return sendErrorPage(res, "Link Expired", "This share link has expired.");
    }

    let jobDetails = {};
    try {
      if (data.jobId) {
        const jobDoc = await db.collection("taskRequests").doc(data.jobId).get();
        if (jobDoc.exists) jobDetails = jobDoc.data();
      }
    } catch (jobError) {
      console.error("Error fetching job details:", jobError);
    }

    await trackClick(shortCode, req);

    const html = generateJobPage(data, jobDetails, APP_CONFIG);
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.status(200).send(html);
  } catch (error) {
    console.error("Error handling short code:", error);
    return sendErrorPage(res, "Server Error", "An error occurred while processing your request.");
  }
};

function sendErrorPage(res, title, message) {
  return res.status(404).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - Buez</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#0f0c29,#302b63,#24243e);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
    .c{background:rgba(255,255,255,.06);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.1);padding:40px;border-radius:24px;text-align:center;max-width:400px;width:100%}
    .e{font-size:64px;margin-bottom:20px;display:block}
    h1{color:#fff;margin-bottom:10px;font-size:24px}
    p{color:rgba(255,255,255,.6);margin-bottom:20px;line-height:1.6}
    a{display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;text-decoration:none;border-radius:12px;font-weight:600}
  </style>
</head>
<body>
  <div class="c"><span class="e">😕</span><h1>${title}</h1><p>${message}</p><a href="/">Go to Buez Home</a></div>
</body>
</html>`);
}

function generateJobPage(linkData, jobDetails, appConfig) {
  const jobTitle        = linkData.jobTitle || jobDetails.customTaskTitle || "Job Opportunity";
  const description     = linkData.jobDescription || jobDetails.description || "";
  const company         = linkData.companyName || jobDetails.user?.userName || "";
  const taskType        = jobDetails.taskType || "";
  const numberOfWorkers = jobDetails.numberOfWorkers || 1;
  const slotsAvailable  = jobDetails.slotsAvailable || numberOfWorkers;
  const isBulkRequest   = jobDetails.isBulkRequest || false;

  const metaDescription = description?.length > 150
    ? description.substring(0, 147) + "..." : description;

  let imageUrl = "https://buez-app.vercel.app/logo.png";
  if (jobDetails.imageUrls?.length > 0) imageUrl = jobDetails.imageUrls[0];

  // ─── URLs ────────────────────────────────────────────────────────────────
  const deepLinkUrl      = `${appConfig.urlScheme}://job/${linkData.jobId}`;
  const universalLinkUrl = `https://buez-app.vercel.app/job/${linkData.jobId}`;
  const iosStoreUrl      = appConfig.useTestFlight && appConfig.iosTestFlightUrl
    ? appConfig.iosTestFlightUrl
    : `https://apps.apple.com/app/id${appConfig.iosAppId}`;
  const androidStoreUrl  = `https://play.google.com/store/apps/details?id=${appConfig.androidPackage}`;

  // ─── Chips ───────────────────────────────────────────────────────────────
  let compensationInfo = "";
  if (jobDetails.compensationType === "Monitarely" && jobDetails.monitarily) {
    const sym = jobDetails.currencyInfo?.symbol || "$";
    compensationInfo = `<div class="chip"><span>💰</span><span>${sym}${jobDetails.monitarily}</span></div>`;
  } else if (jobDetails.otherCompensation) {
    compensationInfo = `<div class="chip"><span>💰</span><span>${jobDetails.otherCompensation}</span></div>`;
  }
  const locationInfo = jobDetails.address?.name
    ? `<div class="chip"><span>📍</span><span>${jobDetails.address.name}</span></div>` : "";
  const taskTypeInfo = taskType
    ? `<div class="chip"><span>🏷️</span><span>${taskType}</span></div>` : "";
  const workersInfo  = (isBulkRequest && numberOfWorkers > 1)
    ? `<div class="chip"><span>👥</span><span>${numberOfWorkers} Workers · ${slotsAvailable} Slots Open</span></div>` : "";

  // ─── Posted by ───────────────────────────────────────────────────────────
  let postedByInfo = "";
  if (jobDetails.user?.userName) {
    const pic = jobDetails.user?.profileImage || "";
    const bio = jobDetails.user?.biography || "";
    postedByInfo = `
      <div class="posted-by">
        ${pic
          ? `<img src="${pic}" alt="${jobDetails.user.userName}" class="avatar">`
          : `<div class="avatar-ph">👤</div>`}
        <div>
          <div class="poster-name">${jobDetails.user.userName}</div>
          ${bio ? `<div class="poster-bio">${bio.length > 100 ? bio.substring(0, 97) + "..." : bio}</div>` : ""}
        </div>
      </div>`;
  }

  // ─── Status badge ────────────────────────────────────────────────────────
  let statusBadge = "";
  if (jobDetails.status) {
    const c = jobDetails.status === "Active" ? "#10b981"
            : jobDetails.status === "Completed" ? "#6b7280" : "#f59e0b";
    statusBadge = `<span class="status-badge" style="background:${c}20;color:${c};border-color:${c}40">${jobDetails.status}</span>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
  <title>${jobTitle} - ${appConfig.appName}</title>

  <meta name="title"       content="${jobTitle} - ${appConfig.appName}">
  <meta name="description" content="${metaDescription}">

  <meta property="og:type"        content="website">
  <meta property="og:url"         content="${universalLinkUrl}">
  <meta property="og:title"       content="${jobTitle} - ${appConfig.appName}">
  <meta property="og:description" content="${metaDescription}">
  <meta property="og:image"       content="${imageUrl}">

  <meta property="twitter:card"        content="summary_large_image">
  <meta property="twitter:url"         content="${universalLinkUrl}">
  <meta property="twitter:title"       content="${jobTitle} - ${appConfig.appName}">
  <meta property="twitter:description" content="${metaDescription}">
  <meta property="twitter:image"       content="${imageUrl}">

  <meta property="al:ios:url"          content="${deepLinkUrl}">
  <meta property="al:ios:app_store_id" content="${appConfig.iosAppId}">
  <meta property="al:ios:app_name"     content="${appConfig.appName}">
  <meta property="al:android:url"      content="${deepLinkUrl}">
  <meta property="al:android:app_name" content="${appConfig.appName}">
  <meta property="al:android:package"  content="${appConfig.androidPackage}">
  <meta property="al:web:url"          content="${universalLinkUrl}">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">

  <style>
    :root {
      --brand:    #7C5CFC;
      --brand-l:  #9B82FF;
      --brand-d:  #5B3FD4;
      --accent:   #FF6B6B;
      --bg:       #0D0B14;
      --bg2:      #16121F;
      --bg3:      #1E1830;
      --border:   rgba(255,255,255,.08);
      --border-h: rgba(124,92,252,.4);
      --t1:       #F0ECFF;
      --t2:       rgba(240,236,255,.55);
      --t3:       rgba(240,236,255,.3);
      --r:        12px;
    }
    *, *::before, *::after {
      margin:0; padding:0; box-sizing:border-box;
      -webkit-tap-highlight-color:transparent;
    }
    html { -webkit-text-size-adjust:100%; }
    body {
      font-family:'DM Sans',-apple-system,sans-serif;
      background:var(--bg); color:var(--t1);
      min-height:100vh;
      display:flex; align-items:center; justify-content:center;
      padding:20px 16px 48px;
      position:relative; overflow-x:hidden;
    }
    body::before {
      content:''; position:fixed; top:-20%; left:50%; transform:translateX(-50%);
      width:600px; height:600px;
      background:radial-gradient(circle,rgba(124,92,252,.18) 0%,transparent 70%);
      pointer-events:none; z-index:0;
    }
    .card {
      background:var(--bg2); border:1px solid var(--border);
      border-radius:24px; max-width:480px; width:100%; overflow:hidden;
      position:relative; z-index:1;
      box-shadow:0 32px 80px rgba(0,0,0,.5),0 0 0 1px rgba(255,255,255,.03);
      animation:up .5s cubic-bezier(.34,1.56,.64,1) both;
    }
    @keyframes up {
      from{opacity:0;transform:translateY(24px) scale(.97)}
      to  {opacity:1;transform:translateY(0) scale(1)}
    }
    .img-wrap{position:relative;width:100%;height:210px;overflow:hidden}
    .img-wrap img{width:100%;height:100%;object-fit:cover;display:block}
    .img-wrap::after{
      content:'';position:absolute;bottom:0;left:0;right:0;height:90px;
      background:linear-gradient(transparent,var(--bg2));
    }
    .brand-bar{display:flex;align-items:center;justify-content:space-between;padding:18px 22px 0}
    .brand-name{
      font-family:'Syne',sans-serif;font-weight:800;font-size:18px;
      background:linear-gradient(135deg,var(--brand-l),var(--accent));
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
    }
    .brand-tag{font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;letter-spacing:1px}
    .content{padding:18px 22px 22px}
    .job-title{
      font-family:'Syne',sans-serif;font-weight:700;font-size:21px;
      line-height:1.3;color:var(--t1);margin-bottom:6px;
    }
    .job-company{font-size:14px;color:var(--brand-l);font-weight:500;margin-bottom:10px}
    .status-badge{
      display:inline-flex;align-items:center;padding:4px 10px;
      border-radius:20px;font-size:11px;font-weight:600;
      letter-spacing:.5px;text-transform:uppercase;border:1px solid;
    }
    .posted-by{
      display:flex;align-items:center;gap:12px;
      background:var(--bg3);border:1px solid var(--border);
      border-radius:var(--r);padding:12px;margin:16px 0;
    }
    .avatar{width:44px;height:44px;border-radius:50%;object-fit:cover;border:2px solid var(--brand);flex-shrink:0}
    .avatar-ph{
      width:44px;height:44px;border-radius:50%;background:var(--bg3);
      border:2px solid var(--border);display:flex;align-items:center;
      justify-content:center;font-size:20px;flex-shrink:0;
    }
    .poster-name{font-weight:600;font-size:14px;color:var(--t1);margin-bottom:2px}
    .poster-bio{font-size:12px;color:var(--t2);line-height:1.4}
    .job-info{
      background:var(--bg3);border:1px solid var(--border);
      border-radius:var(--r);padding:14px;margin-bottom:18px;
    }
    .desc{font-size:13px;color:var(--t2);line-height:1.7;margin-bottom:12px}
    .chips{display:flex;flex-wrap:wrap;gap:7px}
    .chip{
      display:inline-flex;align-items:center;gap:5px;
      background:var(--bg2);border:1px solid var(--border);
      border-radius:7px;padding:5px 9px;font-size:12px;color:var(--t2);font-weight:500;
    }
    .cta{display:flex;flex-direction:column;gap:9px}
    .status-bar{
      display:none;align-items:center;justify-content:center;gap:10px;
      padding:13px;background:rgba(124,92,252,.08);border:1px solid rgba(124,92,252,.2);
      border-radius:var(--r);font-size:13px;color:var(--brand-l);font-weight:500;
    }
    .spinner{
      width:16px;height:16px;flex-shrink:0;
      border:2px solid rgba(124,92,252,.25);border-top-color:var(--brand-l);
      border-radius:50%;animation:spin .8s linear infinite;
    }
    @keyframes spin{to{transform:rotate(360deg)}}
    .btn-open{
      display:flex;align-items:center;justify-content:center;gap:9px;
      width:100%;padding:16px 24px;
      background:linear-gradient(135deg,var(--brand),var(--brand-d));
      color:#fff;border:none;border-radius:var(--r);
      font-family:'DM Sans',sans-serif;font-size:16px;font-weight:600;
      cursor:pointer;-webkit-appearance:none;
      box-shadow:0 8px 24px rgba(124,92,252,.35);
      transition:transform .15s,box-shadow .15s;
      position:relative;overflow:hidden;
      /* iOS critical */
      -webkit-user-select:none;
      touch-action:manipulation;
    }
    .btn-open:active{transform:scale(.97);box-shadow:0 4px 12px rgba(124,92,252,.3)}
    .btn-store{
      display:none;align-items:center;justify-content:center;gap:9px;
      width:100%;padding:13px 24px;
      background:transparent;color:var(--t2);
      border:1px solid var(--border);border-radius:var(--r);
      font-family:'DM Sans',sans-serif;font-size:14px;font-weight:500;
      cursor:pointer;text-decoration:none;-webkit-appearance:none;
      transition:border-color .2s,color .2s,background .2s;
    }
    .btn-store:active{border-color:var(--border-h);color:var(--t1);background:rgba(124,92,252,.06)}
    .footer{padding:14px 22px 18px;border-top:1px solid var(--border);text-align:center}
    .footer p{font-size:11px;color:var(--t3);line-height:1.6}
    .footer strong{
      font-family:'Syne',sans-serif;font-weight:700;
      background:linear-gradient(135deg,var(--brand-l),var(--accent));
      -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
    }
    @media(max-width:360px){
      .job-title{font-size:18px}
      .content,.brand-bar,.footer{padding-left:16px;padding-right:16px}
    }
  </style>
</head>
<body>
<div class="card">

  ${imageUrl !== "https://buez-app.vercel.app/logo.png"
    ? `<div class="img-wrap"><img src="${imageUrl}" alt="${jobTitle}" loading="lazy"></div>` : ""}

  <div class="brand-bar">
    <span class="brand-name">${appConfig.appName}</span>
    <span class="brand-tag">Job Opportunity</span>
  </div>

  <div class="content">

    <div style="margin-bottom:18px">
      <div class="job-title">${jobTitle}</div>
      ${company ? `<div class="job-company">${company}</div>` : ""}
      ${statusBadge}
    </div>

    ${postedByInfo}

    ${description || compensationInfo || locationInfo || taskTypeInfo || workersInfo ? `
    <div class="job-info">
      ${description ? `<div class="desc">${description}</div>` : ""}
      <div class="chips">${taskTypeInfo}${compensationInfo}${locationInfo}${workersInfo}</div>
    </div>` : ""}

    <div class="cta">
      <div class="status-bar" id="statusBar">
        <div class="spinner"></div>
        <span id="statusTxt">Opening ${appConfig.appName}…</span>
      </div>

      <button class="btn-open" id="openBtn">
        <span style="font-size:19px">📱</span>
        Open in ${appConfig.appName}
      </button>

      <a href="${iosStoreUrl}" class="btn-store" id="iosBtn">
        ${appConfig.useTestFlight ? "✈️ Join TestFlight Beta" : "📱 Download on App Store"}
      </a>
      <a href="${androidStoreUrl}" class="btn-store" id="androidBtn">
        🤖 Get it on Google Play
      </a>
    </div>

  </div>

  <div class="footer">
    <p>Powered by <strong>${appConfig.appName}</strong><br>
    Tap the button above to view &amp; apply for this job</p>
  </div>

</div>

<script>
// ═══════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════
var CFG = {
  deepLink:   '${deepLinkUrl}',
  iosStore:   '${iosStoreUrl}',
  droidStore: '${androidStoreUrl}',
  scheme:     '${appConfig.urlScheme}',
  pkg:        '${appConfig.androidPackage}',
  appName:    '${appConfig.appName}'
};

// ═══════════════════════════════════════════════════
//  PLATFORM DETECTION
// ═══════════════════════════════════════════════════
var ua            = navigator.userAgent || navigator.vendor || window.opera || '';
var isIOS         = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
var isAndroid     = /android/i.test(ua);
var isSafari      = isIOS && /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS|mercury/i.test(ua);
var isChromeIOS   = isIOS && /CriOS/i.test(ua);
// In-app browsers (FB, IG, WhatsApp, Telegram, Snapchat) block URL schemes
var isInApp       = /FBAN|FBAV|Instagram|WhatsApp|Snapchat|Line\/|TelegramBot/i.test(ua);
var isAndroidChrome = isAndroid && /Chrome/.test(ua) && !/Chromium/.test(ua);

console.log('[Buez]', {isIOS, isAndroid, isSafari, isChromeIOS, isInApp, isAndroidChrome});

// ═══════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════
var appOpened     = false;
var fallbackTmr   = null;
var autoTriggered = false;

// ═══════════════════════════════════════════════════
//  VISIBILITY LISTENERS
//  Page going hidden = user switched to the app ✓
// ═══════════════════════════════════════════════════
document.addEventListener('visibilitychange', function () {
  if (document.hidden) { appOpened = true; clearTimeout(fallbackTmr); }
});
window.addEventListener('pagehide', function () { appOpened = true; clearTimeout(fallbackTmr); });
window.addEventListener('blur',     function () { appOpened = true; clearTimeout(fallbackTmr); });

// ═══════════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════════
function showStatus(txt) {
  var bar = document.getElementById('statusBar');
  var el  = document.getElementById('statusTxt');
  if (bar) bar.style.display = 'flex';
  if (el && txt) el.textContent = txt;
}
function hideStatus() {
  var bar = document.getElementById('statusBar');
  if (bar) bar.style.display = 'none';
}
function showStoreButtons() {
  hideStatus();
  if (isIOS) {
    var b = document.getElementById('iosBtn');
    if (b) b.style.display = 'flex';
  } else if (isAndroid) {
    var b = document.getElementById('androidBtn');
    if (b) b.style.display = 'flex';
  } else {
    var bi = document.getElementById('iosBtn');
    var ba = document.getElementById('androidBtn');
    if (bi) bi.style.display = 'flex';
    if (ba) ba.style.display = 'flex';
  }
}

// ═══════════════════════════════════════════════════
//  STRATEGY A — Safari iOS (all versions incl. 17+)
//
//  KEY INSIGHT: The hidden-iframe trick is DEAD on iOS 16.4+.
//  The correct modern approach is:
//    1. window.location = customScheme  (direct assignment)
//    2. Fallback timer at 300ms
//
//  WHY 300ms works:
//   • If app IS installed: iOS switches immediately (<100ms).
//     visibilitychange fires → timer is cleared. ✓
//   • If app NOT installed: nothing happens. After 300ms we
//     redirect to TestFlight BEFORE Safari renders its
//     "Cannot Open Page" dialog (which takes ~700ms). ✓
//
//  This is the same approach used by Branch.io on iOS 17+.
// ═══════════════════════════════════════════════════
function tryOpenSafari() {
  console.log('[Buez] Safari: direct window.location + 300ms fallback');
  appOpened = false;
  showStatus('Opening ' + CFG.appName + '…');

  window.location.href = CFG.deepLink;

  fallbackTmr = setTimeout(function () {
    if (!appOpened) {
      console.log('[Buez] Safari: app not installed → store');
      window.location.href = CFG.iosStore;
    }
  }, 300);
}

// ═══════════════════════════════════════════════════
//  STRATEGY B — Chrome iOS (CriOS) & other iOS browsers
//  CriOS does NOT show the "Cannot Open Page" dialog,
//  so direct assignment + 300ms fallback is safe.
// ═══════════════════════════════════════════════════
function tryOpenChromeIOS() {
  console.log('[Buez] CriOS/other iOS: direct + 300ms fallback');
  appOpened = false;
  showStatus('Opening ' + CFG.appName + '…');

  window.location.href = CFG.deepLink;

  fallbackTmr = setTimeout(function () {
    if (!appOpened) {
      console.log('[Buez] CriOS: app not installed → store');
      window.location.href = CFG.iosStore;
    }
  }, 300);
}

// ═══════════════════════════════════════════════════
//  STRATEGY C — In-App Browser (FB / IG / WhatsApp)
//  These WKWebViews completely block custom URL schemes.
//  Inform the user to open in Safari instead.
// ═══════════════════════════════════════════════════
function tryOpenInApp() {
  console.log('[Buez] In-app browser — URL scheme blocked');
  hideStatus();
  var btn = document.getElementById('openBtn');
  if (btn) {
    btn.innerHTML = '<span style="font-size:19px">⚠️</span> Open this link in Safari';
    btn.style.fontSize = '14px';
    btn.onclick = function () {
      // Redirect to the store (https: is always openable from in-app browsers)
      window.location.href = CFG.iosStore;
    };
  }
}

// ═══════════════════════════════════════════════════
//  STRATEGY D — Android Chrome (Intent URL)
//  Chrome handles the app-not-installed case natively
//  via S.browser_fallback_url in the Intent URL.
// ═══════════════════════════════════════════════════
function tryOpenAndroid() {
  appOpened = false;

  if (isAndroidChrome) {
    console.log('[Buez] Android Chrome: Intent URL');
    // Extract path after scheme://
    var path = CFG.deepLink.replace(/^[a-z][a-z0-9+\-.]*:\/\//i, '');
    var intentUrl = 'intent://' + path
      + '#Intent'
      + ';scheme=' + CFG.scheme
      + ';package=' + CFG.pkg
      + ';S.browser_fallback_url=' + encodeURIComponent(CFG.droidStore)
      + ';end';
    window.location.href = intentUrl;
    // Safety net in case intent handling takes long
    fallbackTmr = setTimeout(function () {
      if (!appOpened) window.location.href = CFG.droidStore;
    }, 3000);
  } else {
    // Firefox Android, Samsung Browser, etc.
    console.log('[Buez] Android other browser: direct scheme');
    window.location.href = CFG.deepLink;
    fallbackTmr = setTimeout(function () {
      if (!appOpened) window.location.href = CFG.droidStore;
    }, 2500);
  }
}

// ═══════════════════════════════════════════════════
//  MAIN HANDLER
// ═══════════════════════════════════════════════════
function handleOpenApp() {
  clearTimeout(fallbackTmr);
  appOpened = false;

  if (isIOS) {
    if (isInApp)          tryOpenInApp();
    else if (isSafari)    tryOpenSafari();
    else                  tryOpenChromeIOS(); // CriOS, FxiOS, EdgiOS…
  } else if (isAndroid) {
    tryOpenAndroid();
  } else {
    showStoreButtons(); // Desktop
  }
}

// ═══════════════════════════════════════════════════
//  WIRE UP AFTER DOM READY
// ═══════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function () {
  var btn = document.getElementById('openBtn');

  if (btn) {
    // 'click' covers desktop + mobile
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      handleOpenApp();
    });
    // Explicit touchend ensures iOS WKWebViews that swallow 'click' still work
    btn.addEventListener('touchend', function (e) {
      e.preventDefault();
      handleOpenApp();
    });
  }

  // Auto-trigger on mobile after 700ms (gives page time to paint)
  if ((isIOS || isAndroid) && !isInApp) {
    setTimeout(function () {
      if (!autoTriggered) {
        autoTriggered = true;
        handleOpenApp();
      }
    }, 700);
  } else if (!isIOS && !isAndroid) {
    showStoreButtons();
  }
});
</script>
</body>
</html>`;
}
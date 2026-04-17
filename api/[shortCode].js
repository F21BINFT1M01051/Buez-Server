const { admin } = require("../firebaseAdmin");
const { db } = require("../firebaseAdmin");

const APP_CONFIG = {
  urlScheme: "buez",
  iosAppId: "6753902802",
  iosTestFlightUrl: "https://testflight.apple.com/join/ZcR7R163",
  androidPackage: "com.adamburg.Buez",
  appName: "Buez",
  useTestFlight: true, // Set to false when publishing to App Store
};

// Track click in Firebase
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

  console.log("Query:", req.query);
  console.log("Params:", req.params);
  console.log("Extracted shortCode:", shortCode);

  if (!shortCode) {
    return sendErrorPage(res, "Invalid Link", "The link is missing a code.");
  }

  try {
    const linkDoc = await db.collection("shareLinks").doc(shortCode).get();

    if (!linkDoc.exists) {
      return sendErrorPage(
        res,
        "Link Not Found",
        "This share link has expired or doesn't exist."
      );
    }

    const data = linkDoc.data();
    const now = new Date();

    if (!data.isActive) {
      return sendErrorPage(
        res,
        "Link Deactivated",
        "This share link has been deactivated."
      );
    }

    if (data.expiresAt && data.expiresAt.toDate() < now) {
      return sendErrorPage(res, "Link Expired", "This share link has expired.");
    }

    let jobDetails = {};
    try {
      if (data.jobId) {
        const jobDoc = await db
          .collection("taskRequests")
          .doc(data.jobId)
          .get();
        if (jobDoc.exists) {
          jobDetails = jobDoc.data();
        }
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
    return sendErrorPage(
      res,
      "Server Error",
      "An error occurred while processing your request."
    );
  }
};

function sendErrorPage(res, title, message) {
  return res.status(404).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title} - Buez</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: rgba(255,255,255,0.05);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.1);
          padding: 40px;
          border-radius: 24px;
          text-align: center;
          max-width: 400px;
          width: 100%;
        }
        .emoji { font-size: 64px; margin-bottom: 20px; display: block; }
        h1 { color: #fff; margin-bottom: 10px; font-size: 24px; }
        p { color: rgba(255,255,255,0.6); margin-bottom: 20px; line-height: 1.6; }
        .btn {
          display: inline-block;
          padding: 14px 28px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          text-decoration: none;
          border-radius: 12px;
          font-weight: 600;
          margin-top: 10px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <span class="emoji">😕</span>
        <h1>${title}</h1>
        <p>${message}</p>
        <a href="/" class="btn">Go to Buez Home</a>
      </div>
    </body>
    </html>
  `);
}

function generateJobPage(linkData, jobDetails, appConfig) {
  const jobTitle =
    linkData.jobTitle || jobDetails.customTaskTitle || "Job Opportunity";
  const description = linkData.jobDescription || jobDetails.description || "";
  const company =
    linkData.companyName || jobDetails.user?.userName || "";
  const taskType = jobDetails.taskType || "";
  const numberOfWorkers = jobDetails.numberOfWorkers || 1;
  const slotsAvailable = jobDetails.slotsAvailable || numberOfWorkers;
  const isBulkRequest = jobDetails.isBulkRequest || false;

  const metaDescription =
    description?.length > 150
      ? description.substring(0, 147) + "..."
      : description;

  let imageUrl = "https://buez-app.vercel.app/logo.png";
  if (jobDetails.imageUrls && jobDetails.imageUrls.length > 0) {
    imageUrl = jobDetails.imageUrls[0];
  }

  const deepLinkUrl = `${appConfig.urlScheme}://job/${linkData.jobId}`;
  const universalLinkUrl = `https://buez-app.vercel.app/job/${linkData.jobId}`;

  const iosStoreUrl =
    appConfig.useTestFlight && appConfig.iosTestFlightUrl
      ? appConfig.iosTestFlightUrl
      : `https://apps.apple.com/app/id${appConfig.iosAppId}`;
  const androidStoreUrl = `https://play.google.com/store/apps/details?id=${appConfig.androidPackage}`;

  let compensationInfo = "";
  if (
    jobDetails.compensationType === "Monitarely" &&
    jobDetails.monitarily
  ) {
    const currencySymbol = jobDetails.currencyInfo?.symbol || "$";
    compensationInfo = `<div class="info-chip"><span class="chip-icon">💰</span><span>${currencySymbol}${jobDetails.monitarily}</span></div>`;
  } else if (jobDetails.otherCompensation) {
    compensationInfo = `<div class="info-chip"><span class="chip-icon">💰</span><span>${jobDetails.otherCompensation}</span></div>`;
  }

  let locationInfo = "";
  if (jobDetails.address?.name) {
    locationInfo = `<div class="info-chip"><span class="chip-icon">📍</span><span>${jobDetails.address.name}</span></div>`;
  }

  let taskTypeInfo = "";
  if (taskType) {
    taskTypeInfo = `<div class="info-chip"><span class="chip-icon">🏷️</span><span>${taskType}</span></div>`;
  }

  let workersInfo = "";
  if (isBulkRequest && numberOfWorkers > 1) {
    workersInfo = `<div class="info-chip"><span class="chip-icon">👥</span><span>${numberOfWorkers} Workers Needed · ${slotsAvailable} Slots Open</span></div>`;
  }

  let postedByInfo = "";
  if (jobDetails.user?.userName) {
    const profileImage = jobDetails.user?.profileImage || "";
    const biography = jobDetails.user?.biography || "";
    postedByInfo = `
      <div class="posted-by">
        ${
          profileImage
            ? `<img src="${profileImage}" alt="${jobDetails.user.userName}" class="poster-avatar">`
            : '<div class="poster-avatar-placeholder">👤</div>'
        }
        <div class="poster-info">
          <div class="poster-name">${jobDetails.user.userName}</div>
          ${
            biography
              ? `<div class="poster-bio">${biography.length > 100 ? biography.substring(0, 97) + "..." : biography}</div>`
              : ""
          }
        </div>
      </div>
    `;
  }

  let statusBadge = "";
  if (jobDetails.status) {
    const statusColor =
      jobDetails.status === "Active"
        ? "#10b981"
        : jobDetails.status === "Completed"
        ? "#6b7280"
        : "#f59e0b";
    statusBadge = `<span class="status-badge" style="background:${statusColor}20;color:${statusColor};border-color:${statusColor}40;">${jobDetails.status}</span>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <title>${jobTitle} - ${appConfig.appName}</title>

  <!-- Primary Meta -->
  <meta name="title" content="${jobTitle} - ${appConfig.appName}">
  <meta name="description" content="${metaDescription}">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${universalLinkUrl}">
  <meta property="og:title" content="${jobTitle} - ${appConfig.appName}">
  <meta property="og:description" content="${metaDescription}">
  <meta property="og:image" content="${imageUrl}">

  <!-- Twitter -->
  <meta property="twitter:card" content="summary_large_image">
  <meta property="twitter:url" content="${universalLinkUrl}">
  <meta property="twitter:title" content="${jobTitle} - ${appConfig.appName}">
  <meta property="twitter:description" content="${metaDescription}">
  <meta property="twitter:image" content="${imageUrl}">

  <!-- App Links (Facebook App Links Protocol) -->
  <meta property="al:ios:url" content="${deepLinkUrl}">
  <meta property="al:ios:app_store_id" content="${appConfig.iosAppId}">
  <meta property="al:ios:app_name" content="${appConfig.appName}">
  <meta property="al:android:url" content="${deepLinkUrl}">
  <meta property="al:android:app_name" content="${appConfig.appName}">
  <meta property="al:android:package" content="${appConfig.androidPackage}">
  <meta property="al:web:url" content="${universalLinkUrl}">

  <style>
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500;600&display=swap');

    :root {
      --brand: #7C5CFC;
      --brand-light: #9B82FF;
      --brand-dark: #5B3FD4;
      --accent: #FF6B6B;
      --surface: #0D0B14;
      --surface-2: #16121F;
      --surface-3: #1E1830;
      --border: rgba(255,255,255,0.08);
      --border-hover: rgba(124,92,252,0.4);
      --text-primary: #F0ECFF;
      --text-secondary: rgba(240,236,255,0.55);
      --text-muted: rgba(240,236,255,0.3);
      --radius: 18px;
      --radius-sm: 12px;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

    html, body {
      min-height: 100%;
      overscroll-behavior: none;
    }

    body {
      font-family: 'DM Sans', -apple-system, sans-serif;
      background: var(--surface);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px 16px 40px;
      position: relative;
      overflow-x: hidden;
    }

    /* Background ambient glow */
    body::before {
      content: '';
      position: fixed;
      top: -20%;
      left: 50%;
      transform: translateX(-50%);
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, rgba(124,92,252,0.18) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }
    body::after {
      content: '';
      position: fixed;
      bottom: -10%;
      right: -10%;
      width: 400px;
      height: 400px;
      background: radial-gradient(circle, rgba(255,107,107,0.08) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }

    .card {
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 24px;
      max-width: 480px;
      width: 100%;
      overflow: hidden;
      position: relative;
      z-index: 1;
      box-shadow: 0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03);
      animation: cardIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }

    @keyframes cardIn {
      from { opacity: 0; transform: translateY(24px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    /* Job Image */
    .job-image-wrap {
      position: relative;
      width: 100%;
      height: 200px;
      overflow: hidden;
    }
    .job-image-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .job-image-wrap::after {
      content: '';
      position: absolute;
      bottom: 0; left: 0; right: 0;
      height: 80px;
      background: linear-gradient(transparent, var(--surface-2));
    }

    /* App brand bar */
    .brand-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 24px 0;
    }
    .brand-name {
      font-family: 'Syne', sans-serif;
      font-weight: 800;
      font-size: 18px;
      background: linear-gradient(135deg, var(--brand-light), var(--accent));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .brand-tag {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    /* Main content area */
    .content {
      padding: 20px 24px 24px;
    }

    /* Job Header */
    .job-header { margin-bottom: 20px; }
    .job-title {
      font-family: 'Syne', sans-serif;
      font-weight: 700;
      font-size: 22px;
      line-height: 1.3;
      color: var(--text-primary);
      margin-bottom: 8px;
    }
    .job-company {
      font-size: 15px;
      color: var(--brand-light);
      font-weight: 500;
      margin-bottom: 10px;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      border: 1px solid;
    }

    /* Posted by */
    .posted-by {
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--surface-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 14px;
      margin-bottom: 18px;
    }
    .poster-avatar {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid var(--brand);
      flex-shrink: 0;
    }
    .poster-avatar-placeholder {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      background: var(--surface-3);
      border: 2px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
    }
    .poster-name {
      font-weight: 600;
      font-size: 14px;
      color: var(--text-primary);
      margin-bottom: 3px;
    }
    .poster-bio {
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.4;
    }

    /* Job info section */
    .job-info {
      background: var(--surface-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 16px;
      margin-bottom: 20px;
    }
    .description {
      font-size: 14px;
      color: var(--text-secondary);
      line-height: 1.7;
      margin-bottom: 14px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .info-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 13px;
      color: var(--text-secondary);
      font-weight: 500;
    }
    .chip-icon { font-size: 14px; }

    /* ─── CTA Section ─── */
    .cta-section { display: flex; flex-direction: column; gap: 10px; }

    /* Primary open-in-app button */
    .btn-primary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 17px 24px;
      background: linear-gradient(135deg, var(--brand) 0%, var(--brand-dark) 100%);
      color: white;
      border: none;
      border-radius: var(--radius-sm);
      font-family: 'DM Sans', sans-serif;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s ease;
      box-shadow: 0 8px 24px rgba(124,92,252,0.35);
      -webkit-appearance: none;
      position: relative;
      overflow: hidden;
    }
    .btn-primary::before {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, rgba(255,255,255,0.15), transparent);
      opacity: 0;
      transition: opacity 0.2s;
    }
    .btn-primary:active::before { opacity: 1; }
    .btn-primary:active { transform: scale(0.98); }
    .btn-primary .btn-icon { font-size: 20px; }

    /* Secondary store buttons */
    .btn-secondary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 14px 24px;
      background: transparent;
      color: var(--text-secondary);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.2s ease;
      -webkit-appearance: none;
    }
    .btn-secondary:hover, .btn-secondary:active {
      border-color: var(--border-hover);
      color: var(--text-primary);
      background: rgba(124,92,252,0.06);
    }

    /* Status / loading state */
    .status-bar {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 14px;
      background: rgba(124,92,252,0.08);
      border: 1px solid rgba(124,92,252,0.2);
      border-radius: var(--radius-sm);
      font-size: 14px;
      color: var(--brand-light);
      font-weight: 500;
      margin-bottom: 10px;
    }
    .spinner {
      width: 18px;
      height: 18px;
      border: 2.5px solid rgba(124,92,252,0.25);
      border-top-color: var(--brand-light);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      flex-shrink: 0;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Success state */
    .status-success {
      background: rgba(16,185,129,0.08);
      border-color: rgba(16,185,129,0.2);
      color: #10b981;
    }

    /* Footer */
    .footer {
      padding: 16px 24px 20px;
      border-top: 1px solid var(--border);
      text-align: center;
    }
    .footer-text {
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.5;
    }
    .footer-brand {
      font-family: 'Syne', sans-serif;
      font-weight: 700;
      font-size: 13px;
      background: linear-gradient(135deg, var(--brand-light), var(--accent));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    @media (max-width: 360px) {
      .job-title { font-size: 19px; }
      .content { padding: 16px 18px 18px; }
    }
  </style>
</head>
<body>

<div class="card">

  ${
    imageUrl !== "https://buez-app.vercel.app/logo.png"
      ? `<div class="job-image-wrap"><img src="${imageUrl}" alt="${jobTitle}" loading="lazy"></div>`
      : ""
  }

  <div class="brand-bar">
    <span class="brand-name">${appConfig.appName}</span>
    <span class="brand-tag">Job Opportunity</span>
  </div>

  <div class="content">

    <!-- Job header -->
    <div class="job-header">
      <div class="job-title">${jobTitle}</div>
      ${company ? `<div class="job-company">${company}</div>` : ""}
      ${statusBadge}
    </div>

    <!-- Posted by -->
    ${postedByInfo}

    <!-- Job details -->
    ${
      description || compensationInfo || locationInfo || taskTypeInfo || workersInfo
        ? `
    <div class="job-info">
      ${description ? `<div class="description">${description}</div>` : ""}
      <div class="chips">
        ${taskTypeInfo}
        ${compensationInfo}
        ${locationInfo}
        ${workersInfo}
      </div>
    </div>`
        : ""
    }

    <!-- CTA -->
    <div class="cta-section" id="ctaSection">

      <!-- Loading state (shown briefly on Android / desktop) -->
      <div class="status-bar" id="statusBar" style="display:none;">
        <div class="spinner"></div>
        <span id="statusText">Opening ${appConfig.appName}…</span>
      </div>

      <!-- Open in App button -->
      <button class="btn-primary" id="openAppBtn" onclick="handleOpenApp()">
        <span class="btn-icon">📱</span>
        Open in ${appConfig.appName}
      </button>

      <!-- Store fallback buttons (hidden until needed) -->
      <a href="${iosStoreUrl}" class="btn-secondary" id="iosBtn" style="display:none;" onclick="logStoreClick('ios')">
        ${appConfig.useTestFlight ? "✈️ Join TestFlight Beta" : "📱 Download on the App Store"}
      </a>
      <a href="${androidStoreUrl}" class="btn-secondary" id="androidBtn" style="display:none;" onclick="logStoreClick('android')">
        🤖 Get it on Google Play
      </a>

    </div>
  </div>

  <div class="footer">
    <div class="footer-text">
      Powered by <span class="footer-brand">${appConfig.appName}</span><br>
      Tap "Open in ${appConfig.appName}" to view and apply for this job
    </div>
  </div>

</div>

<script>
// ─────────────────────────────────────────────
//  CONFIG (injected server-side)
// ─────────────────────────────────────────────
var CONFIG = {
  deepLink:     '${deepLinkUrl}',
  iosStore:     '${iosStoreUrl}',
  androidStore: '${androidStoreUrl}',
  appName:      '${appConfig.appName}',
  useTestFlight: ${appConfig.useTestFlight}
};

// ─────────────────────────────────────────────
//  PLATFORM DETECTION
// ─────────────────────────────────────────────
var ua         = navigator.userAgent || navigator.vendor || window.opera || '';
var isIOS      = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
var isAndroid  = /android/i.test(ua);
// Safari: no "Chrome" string, has "Safari"
var isSafari   = isIOS && /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS|mercury/i.test(ua);
// Chrome on iOS (CriOS)
var isChromeIOS = isIOS && /CriOS/i.test(ua);

console.log('[Buez] Platform:', { isIOS: isIOS, isAndroid: isAndroid, isSafari: isSafari, isChromeIOS: isChromeIOS });

// ─────────────────────────────────────────────
//  STATE
// ─────────────────────────────────────────────
var appOpened    = false;
var fallbackTimer = null;

// ─────────────────────────────────────────────
//  VISIBILITY / BLUR LISTENERS
//  (detect when the browser goes to background = app opened)
// ─────────────────────────────────────────────
document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    appOpened = true;
    clearTimeout(fallbackTimer);
    console.log('[Buez] visibilitychange → app opened');
  }
});
window.addEventListener('pagehide', function () {
  appOpened = true;
  clearTimeout(fallbackTimer);
});
window.addEventListener('blur', function () {
  appOpened = true;
  clearTimeout(fallbackTimer);
});

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function setStatus(text, isSuccess) {
  var bar = document.getElementById('statusBar');
  if (!bar) return;
  document.getElementById('statusText').textContent = text;
  bar.style.display = 'flex';
  if (isSuccess) bar.classList.add('status-success');
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
    // Desktop — show both
    var bi = document.getElementById('iosBtn');
    var ba = document.getElementById('androidBtn');
    if (bi) bi.style.display = 'flex';
    if (ba) ba.style.display = 'flex';
  }
}

function logStoreClick(platform) {
  console.log('[Buez] Store button clicked:', platform);
}

// ─────────────────────────────────────────────
//  CORE: TRY TO OPEN THE APP
// ─────────────────────────────────────────────

/**
 * Safari on iOS
 * ─────────────
 * window.location deep links trigger an ugly "Cannot Open Page" alert
 * when the app is not installed.  The hidden-<iframe> technique silently
 * attempts the custom scheme; if the app IS installed iOS will open it
 * and the page goes into background (visibilitychange fires).
 * If not installed the iframe just fails quietly — no dialog.
 */
function tryOpenSafari() {
  console.log('[Buez] Strategy: Safari hidden-iframe');
  appOpened = false;

  var iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;border:0;';
  iframe.src = CONFIG.deepLink;
  document.body.appendChild(iframe);

  // Give iOS 2.5 s to switch apps; if still here → app not installed
  fallbackTimer = setTimeout(function () {
    document.body.removeChild(iframe);
    if (!appOpened) {
      console.log('[Buez] Safari: app not detected → store');
      showStoreButtons();
    }
  }, 2500);
}

/**
 * Chrome on iOS (CriOS)
 * ──────────────────────
 * CriOS blocks iframes with custom schemes.  Use window.location directly.
 * Chrome on iOS also won't show the ugly alert — it just silently fails,
 * so direct assignment is safe here.
 */
function tryOpenChromeIOS() {
  console.log('[Buez] Strategy: Chrome iOS window.location');
  appOpened = false;
  window.location.href = CONFIG.deepLink;

  fallbackTimer = setTimeout(function () {
    if (!appOpened) {
      console.log('[Buez] CriOS: app not detected → store');
      showStoreButtons();
    }
  }, 2500);
}

/**
 * Android (any browser)
 * ──────────────────────
 * Use Intent URL for Chrome; fall back to custom scheme for others.
 * Intent URL lets Chrome launch the app directly and go to Play Store
 * automatically if not installed — but we still set our own fallback
 * for non-Chrome Android browsers.
 */
function tryOpenAndroid() {
  var isChrome = /Chrome/.test(ua) && !/Chromium/.test(ua);
  console.log('[Buez] Strategy: Android', isChrome ? '(Chrome Intent)' : '(direct)');
  appOpened = false;

  if (isChrome) {
    // Intent URL — Chrome will open the app or redirect to Play Store natively
    var intentUrl = CONFIG.deepLink.replace(
      /^([a-z][a-z0-9+\-.]*):\/\//i,
      'intent://'
    ) + '#Intent;scheme=${appConfig.urlScheme};package=${appConfig.androidPackage};end;';
    window.location.href = intentUrl;
  } else {
    window.location.href = CONFIG.deepLink;
  }

  fallbackTimer = setTimeout(function () {
    if (!appOpened) {
      console.log('[Buez] Android: app not detected → store');
      window.location.href = CONFIG.androidStore;
    }
  }, 2500);
}

// ─────────────────────────────────────────────
//  MAIN HANDLER — called by button click
// ─────────────────────────────────────────────
function handleOpenApp() {
  console.log('[Buez] handleOpenApp triggered');

  if (isIOS) {
    if (isSafari) {
      tryOpenSafari();
    } else {
      // Chrome iOS, Firefox iOS, etc.
      tryOpenChromeIOS();
    }
  } else if (isAndroid) {
    tryOpenAndroid();
  } else {
    // Desktop: just show download options
    showStoreButtons();
  }
}

// ─────────────────────────────────────────────
//  ON PAGE LOAD
// ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  console.log('[Buez] DOMContentLoaded');

  if (isIOS || isAndroid) {
    // Auto-trigger after a short delay so user can see the page first
    setTimeout(function () {
      handleOpenApp();
    }, 700);
  } else {
    // Desktop — show store buttons right away
    showStoreButtons();
  }
});
</script>

</body>
</html>`;
}

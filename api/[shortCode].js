import { admin } from "../firebaseAdmin";
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
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          padding: 40px;
          border-radius: 20px;
          text-align: center;
          max-width: 400px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .emoji { font-size: 64px; margin-bottom: 20px; display: block; }
        h1 { color: #333; margin-bottom: 10px; font-size: 24px; }
        p { color: #666; margin-bottom: 20px; line-height: 1.6; }
        .btn {
          display: inline-block;
          padding: 12px 24px;
          background: #667eea;
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-weight: 600;
          transition: background 0.3s;
          margin-top: 10px;
        }
        .btn:hover { background: #5568d3; }
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
  const company = linkData.companyName || jobDetails.user?.userName || "";
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
    const amount = jobDetails.monitarily;
    compensationInfo = `<div class="compensation">Compensation: ${currencySymbol}${amount}</div>`;
  } else if (jobDetails.otherCompensation) {
    compensationInfo = `<div class="compensation">Compensation: ${jobDetails.otherCompensation}</div>`;
  }

  let locationInfo = "";
  if (jobDetails.address?.name) {
    locationInfo = `<div class="location">Location: ${jobDetails.address.name}</div>`;
  }

  let taskTypeInfo = "";
  if (taskType) {
    taskTypeInfo = `<div class="task-type">Category: ${taskType}</div>`;
  }

  let workersInfo = "";
  if (isBulkRequest && numberOfWorkers > 1) {
    workersInfo = `<div class="workers-info">Workers Needed: ${numberOfWorkers} • Available Slots: ${slotsAvailable}</div>`;
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
              ? `<div class="poster-bio">${
                  biography.length > 100
                    ? biography.substring(0, 97) + "..."
                    : biography
                }</div>`
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
    statusBadge = `<div class="status-badge" style="background-color: ${statusColor};">${jobDetails.status}</div>`;
  }

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
    <title>${jobTitle} - ${appConfig.appName}</title>

    <meta name="title" content="${jobTitle} - ${appConfig.appName}">
    <meta name="description" content="${metaDescription}">

    <meta property="og:type" content="website">
    <meta property="og:url" content="https://buez-server-khaki.vercel.app/">
    <meta property="og:title" content="${jobTitle} - ${appConfig.appName}">
    <meta property="og:description" content="${metaDescription}">
    <meta property="og:image" content="${imageUrl}">

    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="https://buez-server-khaki.vercel.app/">
    <meta property="twitter:title" content="${jobTitle} - ${appConfig.appName}">
    <meta property="twitter:description" content="${metaDescription}">
    <meta property="twitter:image" content="${imageUrl}">

    <meta property="al:ios:url" content="${deepLinkUrl}">
    <meta property="al:ios:app_store_id" content="${appConfig.iosAppId}">
    <meta property="al:ios:app_name" content="${appConfig.appName}">
    <meta property="al:android:url" content="${deepLinkUrl}">
    <meta property="al:android:app_name" content="${appConfig.appName}">
    <meta property="al:android:package" content="${appConfig.androidPackage}">
    <meta property="al:web:url" content="https://buez-server-khaki.vercel.app/">

    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .container {
        background: white;
        border-radius: 20px;
        padding: 40px 30px;
        max-width: 500px;
        width: 100%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      }
      .job-header {
        text-align: center;
        margin-bottom: 25px;
        position: relative;
      }
      h1 {
        color: #333;
        font-size: 24px;
        margin-bottom: 8px;
        line-height: 1.4;
        font-weight: 700;
      }
      .company {
        color: #667eea;
        font-size: 18px;
        margin-bottom: 12px;
        font-weight: 600;
      }
      .status-badge {
        display: inline-block;
        padding: 6px 12px;
        border-radius: 20px;
        color: white;
        font-size: 12px;
        font-weight: 600;
        margin-top: 8px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .job-image {
        width: 100%;
        height: 200px;
        object-fit: cover;
        border-radius: 12px;
        margin-bottom: 20px;
      }
      .job-info {
        background: #f8f9ff;
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 25px;
        border-left: 4px solid #667eea;
      }
      .description {
        color: #666;
        font-size: 15px;
        margin-bottom: 15px;
        line-height: 1.6;
      }
      .compensation, .location, .task-type, .workers-info {
        color: #555;
        font-size: 14px;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 500;
      }
      .compensation:before { content: "💰"; }
      .location:before { content: "📍"; }
      .task-type:before { content: "🏷️"; }
      .workers-info:before { content: "👥"; }
      .posted-by {
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 16px;
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .poster-avatar {
        width: 50px;
        height: 50px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid #667eea;
      }
      .poster-avatar-placeholder {
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: #e5e7eb;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
      }
      .poster-info { flex: 1; }
      .poster-name {
        font-weight: 600;
        color: #333;
        font-size: 15px;
        margin-bottom: 4px;
      }
      .poster-bio {
        color: #666;
        font-size: 13px;
        line-height: 1.4;
      }
      .divider {
        height: 1px;
        background: #e5e7eb;
        margin: 20px 0;
      }
      .section-label {
        font-size: 12px;
        font-weight: 600;
        color: #9ca3af;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        margin-bottom: 12px;
      }
      .btn {
        display: block;
        width: 100%;
        padding: 16px 32px;
        margin: 10px 0;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        text-decoration: none;
        border-radius: 12px;
        font-weight: 600;
        font-size: 16px;
        text-align: center;
        transition: all 0.2s ease;
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      }
      .btn:hover {
        opacity: 0.92;
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
      }
      .btn:active { transform: translateY(0); opacity: 1; }
      .btn-secondary {
        background: white;
        color: #667eea;
        border: 2px solid #667eea;
        box-shadow: none;
        font-size: 15px;
        padding: 13px 32px;
      }
      .btn-secondary:hover {
        background: #f8f9ff;
        box-shadow: none;
      }
      .footer {
        margin-top: 24px;
        color: #9ca3af;
        font-size: 12px;
        text-align: center;
        border-top: 1px solid #f3f4f6;
        padding-top: 16px;
        line-height: 1.8;
      }
      @media (max-width: 480px) {
        .container { padding: 28px 18px; }
        h1 { font-size: 20px; }
      }
    </style>
  </head>
  <body>
    <div class="container">

      ${
        imageUrl !== "https://buez-app.vercel.app/logo.png"
          ? `<img src="${imageUrl}" alt="${jobTitle}" class="job-image">`
          : ""
      }

      <div class="job-header">
        <h1>${jobTitle}</h1>
        ${company ? `<div class="company">${company}</div>` : ""}
        ${statusBadge}
      </div>

      ${postedByInfo}

      ${
        description || compensationInfo || locationInfo || taskTypeInfo || workersInfo
          ? `
      <div class="job-info">
        ${description ? `<div class="description">${description}</div>` : ""}
        ${taskTypeInfo}
        ${compensationInfo}
        ${locationInfo}
        ${workersInfo}
      </div>
      `
          : ""
      }

      <div class="divider"></div>
      <div class="section-label">View this opportunity</div>

      <div id="buttons">
        <button class="btn" id="openAppBtn">
          📲 Open in ${appConfig.appName}
        </button>
        <a href="${iosStoreUrl}" class="btn btn-secondary" id="iosBtn" style="display: none;">
          ${appConfig.useTestFlight ? "✈️ Join TestFlight Beta" : "📱 Download for iOS"}
        </a>
        <a href="${androidStoreUrl}" class="btn btn-secondary" id="androidBtn" style="display: none;">
          🤖 Download for Android
        </a>
      </div>

      <div class="footer">
        Powered by ${appConfig.appName}<br>
        <span>Open the app to view details and apply</span>
      </div>
    </div>

    <script>
      const CONFIG = {
        deepLink: '${deepLinkUrl}',
        iosStore: '${iosStoreUrl}',
        androidStore: '${androidStoreUrl}',
        appName: '${appConfig.appName}',
        useTestFlight: ${appConfig.useTestFlight}
      };

      const ua = navigator.userAgent || navigator.vendor || window.opera;
      const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
      const isAndroid = /android/i.test(ua);

      // Show correct store button based on platform
      document.addEventListener('DOMContentLoaded', function () {
        if (isIOS) {
          document.getElementById('iosBtn').style.display = 'block';
        } else if (isAndroid) {
          document.getElementById('androidBtn').style.display = 'block';
        } else {
          // Desktop — show both
          document.getElementById('iosBtn').style.display = 'block';
          document.getElementById('androidBtn').style.display = 'block';
        }

        // "Open in App" button click handler
        document.getElementById('openAppBtn').addEventListener('click', function (e) {
          e.preventDefault();

          // Desktop: no app available, scroll to store buttons
          if (!isIOS && !isAndroid) {
            document.getElementById('iosBtn').scrollIntoView({ behavior: 'smooth' });
            return;
          }

          const storeUrl = isIOS ? CONFIG.iosStore : CONFIG.androidStore;
          let appOpened = false;

          // If page goes hidden → app launched successfully
          const onVisibilityChange = function () {
            if (document.hidden) {
              appOpened = true;
              clearTimeout(storeTimer);
              cleanup();
            }
          };

          // If window loses focus → app launched (works well on Android)
          const onBlur = function () {
            appOpened = true;
            clearTimeout(storeTimer);
            cleanup();
          };

          function cleanup() {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('blur', onBlur);
          }

          document.addEventListener('visibilitychange', onVisibilityChange);
          window.addEventListener('blur', onBlur);

          // Attempt deep link — opens app if installed
          window.location.href = CONFIG.deepLink;

          // After 2s, if still on page and app didn't open → go to store
          const storeTimer = setTimeout(function () {
            cleanup();
            if (!appOpened && !document.hidden) {
              window.location.href = storeUrl;
            }
          }, 2000);
        });
      });
    </script>
  </body>
  </html>
  `;
}
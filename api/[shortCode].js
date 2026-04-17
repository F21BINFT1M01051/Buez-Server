import { admin } from "../firebaseAdmin";
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

    // Increment click count atomically
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
      // Don't fail the main request
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
    // Get link data from Firebase
    const linkDoc = await db.collection("shareLinks").doc(shortCode).get();

    if (!linkDoc.exists) {
      return sendErrorPage(
        res,
        "Link Not Found",
        "This share link has expired or doesn't exist.",
      );
    }

    const data = linkDoc.data();

    // Check if link is active and not expired
    const now = new Date();
    if (!data.isActive) {
      return sendErrorPage(
        res,
        "Link Deactivated",
        "This share link has been deactivated.",
      );
    }

    if (data.expiresAt && data.expiresAt.toDate() < now) {
      return sendErrorPage(res, "Link Expired", "This share link has expired.");
    }

    // Fetch additional job details
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
      // Continue without job details
    }

    // Track the click
    await trackClick(shortCode, req);

    // Generate HTML page
    const html = generateJobPage(data, jobDetails, APP_CONFIG);

    res.setHeader("Content-Type", "text/html");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.status(200).send(html);
  } catch (error) {
    console.error("Error handling short code:", error);
    return sendErrorPage(
      res,
      "Server Error",
      "An error occurred while processing your request.",
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
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
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
        .emoji {
          font-size: 64px;
          margin-bottom: 20px;
          display: block;
        }
        h1 {
          color: #333;
          margin-bottom: 10px;
          font-size: 24px;
        }
        p {
          color: #666;
          margin-bottom: 20px;
          line-height: 1.6;
        }
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
        .btn:hover {
          background: #5568d3;
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
  const jobTitle = linkData.jobTitle || jobDetails.customTaskTitle || "Job Opportunity";
  const description = linkData.jobDescription || jobDetails.description || "";
  const company = linkData.companyName || jobDetails.user?.userName || "";
  const taskType = jobDetails.taskType || "";
  const numberOfWorkers = jobDetails.numberOfWorkers || 1;
  const slotsAvailable = jobDetails.slotsAvailable || numberOfWorkers;
  const isBulkRequest = jobDetails.isBulkRequest || false;

  // Prepare meta description
  const metaDescription =
    description?.length > 150
      ? description.substring(0, 147) + "..."
      : description;

  // Build image URL if available
  let imageUrl = "https://buez-app.vercel.app/logo.png"; // Default logo
  if (jobDetails.imageUrls && jobDetails.imageUrls.length > 0) {
    imageUrl = jobDetails.imageUrls[0];
  }

  const deepLinkUrl = `${appConfig.urlScheme}://job/${linkData.jobId}`;
  const iosStoreUrl = appConfig.useTestFlight && appConfig.iosTestFlightUrl
    ? appConfig.iosTestFlightUrl
    : `https://apps.apple.com/app/id${appConfig.iosAppId}`;
  const androidStoreUrl = `https://play.google.com/store/apps/details?id=${appConfig.androidPackage}`;

  // Add compensation info with currency
  let compensationInfo = "";
  if (jobDetails.compensationType === "Monitarely" && jobDetails.monitarily) {
    const currencySymbol = jobDetails.currencyInfo?.symbol || "$";
    const amount = jobDetails.monitarily;
    compensationInfo = `<div class="compensation">Compensation: ${currencySymbol}${amount}</div>`;
  } else if (jobDetails.otherCompensation) {
    compensationInfo = `<div class="compensation">Compensation: ${jobDetails.otherCompensation}</div>`;
  }

  // Add location if available
  let locationInfo = "";
  if (jobDetails.address?.name) {
    locationInfo = `<div class="location">Location: ${jobDetails.address.name}</div>`;
  }

  // Add task type
  let taskTypeInfo = "";
  if (taskType) {
    taskTypeInfo = `<div class="task-type">Category: ${taskType}</div>`;
  }

  // Add slots/workers info
  let workersInfo = "";
  if (isBulkRequest && numberOfWorkers > 1) {
    workersInfo = `<div class="workers-info">Workers Needed: ${numberOfWorkers} • Available Slots: ${slotsAvailable}</div>`;
  }

  // Add posted by info
  let postedByInfo = "";
  if (jobDetails.user?.userName) {
    const profileImage = jobDetails.user?.profileImage || "";
    const biography = jobDetails.user?.biography || "";
    
    postedByInfo = `
      <div class="posted-by">
        ${profileImage ? `<img src="${profileImage}" alt="${jobDetails.user.userName}" class="poster-avatar">` : '<div class="poster-avatar-placeholder">👤</div>'}
        <div class="poster-info">
          <div class="poster-name">${jobDetails.user.userName}</div>
          ${biography ? `<div class="poster-bio">${biography.length > 100 ? biography.substring(0, 97) + '...' : biography}</div>` : ''}
        </div>
      </div>
    `;
  }

  // Add status badge
  let statusBadge = "";
  if (jobDetails.status) {
    const statusColor = jobDetails.status === "Active" ? "#10b981" : 
                       jobDetails.status === "Completed" ? "#6b7280" : "#f59e0b";
    statusBadge = `<div class="status-badge" style="background-color: ${statusColor};">${jobDetails.status}</div>`;
  }

  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
    <title>${jobTitle} - ${appConfig.appName}</title>
    
    <!-- Primary Meta Tags -->
    <meta name="title" content="${jobTitle} - ${appConfig.appName}">
    <meta name="description" content="${metaDescription}">
    
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://buez-server-khaki.vercel.app/">
    <meta property="og:title" content="${jobTitle} - ${appConfig.appName}">
    <meta property="og:description" content="${metaDescription}">
    <meta property="og:image" content="${imageUrl}">
    
    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="https://buez-server-khaki.vercel.app/">
    <meta property="twitter:title" content="${jobTitle} - ${appConfig.appName}">
    <meta property="twitter:description" content="${metaDescription}">
    <meta property="twitter:image" content="${imageUrl}">
    
    <!-- App Links -->
    <meta property="al:ios:url" content="${deepLinkUrl}">
    <meta property="al:ios:app_store_id" content="${appConfig.iosAppId}">
    <meta property="al:ios:app_name" content="${appConfig.appName}">
    <meta property="al:android:url" content="${deepLinkUrl}">
    <meta property="al:android:app_name" content="${appConfig.appName}">
    <meta property="al:android:package" content="${appConfig.androidPackage}">
    <meta property="al:web:url" content="https://buez-server-khaki.vercel.app/">
    
    <script>
      // Configuration
      const CONFIG = {
        deepLink: '${deepLinkUrl}',
        iosStore: '${iosStoreUrl}',
        androidStore: '${androidStoreUrl}',
        appName: '${appConfig.appName}',
        useTestFlight: ${appConfig.useTestFlight}
      };
      
      // Platform detection
      const userAgent = navigator.userAgent || navigator.vendor || window.opera;
      const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
      const isAndroid = /android/i.test(userAgent);
      const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);
      let appOpened = false;
      let attemptedOpen = false;
      let redirectTimer = null;
      
      // Track if user came from social media
      const referrer = document.referrer;
      const isFromSocialMedia = referrer.includes('facebook.com') || 
                               referrer.includes('whatsapp.com') ||
                               referrer.includes('twitter.com') ||
                               referrer.includes('instagram.com') ||
                               referrer.includes('linkedin.com');
      
      // Open app - Safari compatible with better error handling
      function openApp() {
        if (attemptedOpen) return;
        attemptedOpen = true;
        
        console.log('Attempting to open app with:', CONFIG.deepLink);
        
        // For Safari on iOS, try deep link with quick fallback
        if (isSafari && isIOS) {
          const start = Date.now();
          window.location.href = CONFIG.deepLink;
          
          // Quick fallback - if page is still visible after 1.5 seconds, app didn't open
          redirectTimer = setTimeout(() => {
            const elapsed = Date.now() - start;
            // If we're still here and page is visible, app didn't open
            if (!document.hidden && elapsed < 2000) {
              console.log('App not detected, redirecting to store');
              appOpened = false;
              clearTimeout(redirectTimer);
              // Redirect immediately to TestFlight/App Store
              window.location.href = CONFIG.iosStore;
            }
          }, 1500);
          
        } else if (isAndroid) {
          // Android - try deep link with quick fallback
          const start = Date.now();
          window.location.href = CONFIG.deepLink;
          
          setTimeout(() => {
            if (!document.hidden) {
              window.location.href = CONFIG.androidStore;
            }
          }, 1500);
          
        } else {
          // Desktop or other - show download options
          fallbackToAppStore();
        }
      }
      
      // Fallback to app store
      function fallbackToAppStore() {
        console.log('Showing download options');
        if (redirectTimer) clearTimeout(redirectTimer);
        
        document.getElementById('status').style.display = 'none';
        document.getElementById('buttons').style.display = 'block';
        
        if (isIOS) {
          document.getElementById('iosBtn').style.display = 'inline-block';
        } else if (isAndroid) {
          document.getElementById('androidBtn').style.display = 'inline-block';
        } else {
          // Desktop - show both
          document.getElementById('iosBtn').style.display = 'inline-block';
          document.getElementById('androidBtn').style.display = 'inline-block';
        }
      }
      
      // Track visibility changes (app opening)
      document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
          appOpened = true;
          if (redirectTimer) clearTimeout(redirectTimer);
          console.log('App opened successfully (visibility change)');
        }
      });
      
      // iOS/Safari specific: pagehide event
      window.addEventListener('pagehide', function() {
        appOpened = true;
        if (redirectTimer) clearTimeout(redirectTimer);
        console.log('Page hidden - app likely opened');
      });
      
      // Window blur event
      window.addEventListener('blur', function() {
        appOpened = true;
        if (redirectTimer) clearTimeout(redirectTimer);
        console.log('Window blurred - app likely opened');
      });
      
      // Prevent showing error by catching it
      window.addEventListener('error', function(e) {
        console.log('Error caught:', e);
        e.preventDefault();
        return false;
      });
      
      // Page load handler
      document.addEventListener('DOMContentLoaded', function() {
        console.log('Platform detected:', { isIOS, isAndroid, isSafari });
        console.log('Referrer:', referrer);
        
        // For Safari on iOS, show button first
        if (isSafari && isIOS) {
          // Show UI immediately
          document.getElementById('status').style.display = 'none';
          document.getElementById('buttons').style.display = 'block';
          document.getElementById('openAppBtn').style.display = 'block';
          
          // Auto-trigger after brief delay
          setTimeout(() => {
            if (!attemptedOpen) {
              document.getElementById('openAppBtn').click();
            }
          }, 800);
        } else {
          // For non-Safari, try immediate redirect
          setTimeout(() => {
            openApp();
          }, 500);
        }
      });
      
      // Handle manual "Open in App" button
      document.getElementById('openAppBtn')?.addEventListener('click', function(e) {
        e.preventDefault();
        
        if (isIOS) {
          // Try deep link first, then fallback to store
          openApp();
        } else if (isAndroid) {
          // Try app first, then store
          openApp();
        } else {
          // Desktop - show options
          fallbackToAppStore();
        }
      });
      
      // Handle store button clicks
      document.getElementById('iosBtn')?.addEventListener('click', function(e) {
        console.log('iOS download clicked');
      });
      
      document.getElementById('androidBtn')?.addEventListener('click', function(e) {
        console.log('Android download clicked');
      });
    </script>
    
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
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
      .logo {
        font-size: 48px;
        text-align: center;
        margin-bottom: 20px;
        color: #667eea;
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
      .compensation:before {
        content: "💰";
      }
      .location:before {
        content: "📍";
      }
      .task-type:before {
        content: "🏷️";
      }
      .workers-info:before {
        content: "👥";
      }
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
      .poster-info {
        flex: 1;
      }
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
      .status {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        padding: 20px;
        border-radius: 12px;
        margin-bottom: 20px;
        color: white;
        font-size: 15px;
        font-weight: 500;
        text-align: center;
      }
      .spinner {
        display: inline-block;
        width: 20px;
        height: 20px;
        border: 3px solid rgba(255,255,255,0.3);
        border-top: 3px solid white;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-right: 10px;
        vertical-align: middle;
      }
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .buttons {
        display: none;
      }
      .btn {
        display: block;
        width: 100%;
        padding: 16px 32px;
        margin: 12px 0;
        background: #667eea;
        color: white;
        text-decoration: none;
        border-radius: 12px;
        font-weight: 600;
        font-size: 16px;
        text-align: center;
        transition: all 0.3s ease;
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      }
      .btn:hover {
        background: #5568d3;
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
      }
      .btn:active {
        transform: translateY(0);
      }
      .btn-secondary {
        background: white;
        color: #667eea;
        border: 2px solid #667eea;
        box-shadow: none;
      }
      .btn-secondary:hover {
        background: #f8f9ff;
      }
      .store-buttons {
        margin-top: 10px;
      }
      .footer {
        margin-top: 30px;
        color: #999;
        font-size: 13px;
        text-align: center;
        border-top: 1px solid #eee;
        padding-top: 20px;
      }
      .stats {
        font-size: 12px;
        color: #888;
        margin-top: 5px;
      }
      @media (max-width: 480px) {
        .container {
          padding: 30px 20px;
        }
        h1 {
          font-size: 20px;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      
      ${imageUrl !== "https://buez-app.vercel.app/logo.png" ? `<img src="${imageUrl}" alt="${jobTitle}" class="job-image">` : ''}
      
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
      
      <div class="status" id="status">
        <div class="spinner"></div>
        Opening in ${appConfig.appName} app...
      </div>
      
      <div class="buttons" id="buttons">
        <button class="btn" id="openAppBtn">
          Open in ${appConfig.appName}
        </button>
        
        <div class="store-buttons">
          <a href="${iosStoreUrl}" class="btn btn-secondary" id="iosBtn" style="display: none;">
            ${appConfig.useTestFlight ? "✈️ Join TestFlight Beta" : "📱 Download for iOS"}
          </a>
          <a href="${androidStoreUrl}" class="btn btn-secondary" id="androidBtn" style="display: none;">
            🤖 Download for Android
          </a>
        </div>
      </div>
      
      <div class="footer">
        <div>Powered by ${appConfig.appName}</div>
        <div class="stats">
          • Tap "Open in ${appConfig.appName}" to view and apply
          • Download the app if you don't have it
        </div>
      </div>
    </div>
  </body>
  </html>
  `;
}
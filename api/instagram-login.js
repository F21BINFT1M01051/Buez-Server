// // instagram-login.js (Vercel Serverless Function)
// const axios = require("axios");

// module.exports = async (req, res) => {
//   const { code } = req.query;

//   if (!code) {
//     return res.status(400).json({ error: "Missing code parameter" });
//   }

//   try {
//     const FB_APP_ID = "716889610970681";
//     const FB_APP_SECRET = "2fc223957e3ccdcdfceb59311e226adc";
//     const REDIRECT_URI = "https://buez-server-khaki.vercel.app/api/instagram-login";

//     // Step 1: Exchange code for access token
//     const tokenRes = await axios.get("https://graph.facebook.com/v18.0/oauth/access_token", {
//       params: {
//         client_id: FB_APP_ID,
//         client_secret: FB_APP_SECRET,
//         redirect_uri: REDIRECT_URI,
//         code,
//       },
//     });

//     const access_token = tokenRes.data.access_token;
//     console.log("access_token......", access_token);

//     // ✅ Step 1.5: Check granted permissions
//     const permissionsRes = await axios.get("https://graph.facebook.com/me/permissions", {
//       params: { access_token },
//     });

//     console.log("permissionsRes......", JSON.stringify(permissionsRes.data, null, 2));

//     // Optional: Verify required permissions are granted
//     const requiredPermissions = ["instagram_basic", "instagram_manage_insights", "pages_show_list", "pages_read_engagement"];
//     const grantedPermissions = permissionsRes.data.data.filter((perm) => perm.status === "granted").map((perm) => perm.permission);

//     const missingPermissions = requiredPermissions.filter((perm) => !grantedPermissions.includes(perm));
//     if (missingPermissions.length > 0) {
//       return res.status(403).json({ error: "Missing required permissions", missingPermissions });
//     }

//     // Step 2: Get user’s pages
//     const pagesRes = await axios.get("https://graph.facebook.com/me/accounts", {
//       params: { access_token },
//     });

//     console.log("pagesRes........", pagesRes);
//     console.log("Pages Response:", JSON.stringify(pagesRes.data, null, 2));

//     const page = pagesRes.data.data.find((p) => p.id); // pick first page
//     if (!page) {
//       return res.status(404).json({ error: "No Facebook pages found." });
//     }

//     const pageAccessToken = page.access_token;

//     // Step 3: Get Instagram Business Account ID from page
//     const pageDetailsRes = await axios.get(`https://graph.facebook.com/${page.id}`, {
//       params: {
//         fields: "instagram_business_account",
//         access_token: pageAccessToken,
//       },
//     });

//     const igAccount = pageDetailsRes.data.instagram_business_account;
//     if (!igAccount?.id) {
//       return res.status(404).json({ error: "No Instagram Business account linked to page." });
//     }

//     // Step 4: Get Instagram Business Profile
//     const igProfileRes = await axios.get(`https://graph.facebook.com/${igAccount.id}`, {
//       params: {
//         fields: "id,username,profile_picture_url",
//         access_token: pageAccessToken,
//       },
//     });

//     return res.status(200).json({
//       access_token: pageAccessToken,
//       profile: igProfileRes.data,
//     });
//   } catch (err) {
//     console.error("Instagram Business Login Error:", err.response?.data || err.message);
//     return res.status(500).json({ error: "Instagram business login failed." });
//   }
// };


// /api/instagram-token-login.js
const axios = require("axios");

module.exports = async (req, res) => {
  const { token } = req.query;

  if (!token) return res.status(400).json({ error: "Missing token" });

  try {
    const pagesRes = await axios.get("https://graph.facebook.com/v23.0/me/accounts", {
      params: { access_token: token },
    });

    const page = pagesRes.data.data.find((p) => p.instagram_business_account);
    if (!page) return res.status(404).json({ error: "No connected IG business account" });

    const igAccountId = page.instagram_business_account.id;

    const igProfile = await axios.get(`https://graph.facebook.com/${igAccountId}`, {
      params: {
        fields: "id,username,profile_picture_url",
        access_token: page.access_token,
      },
    });

    return res.status(200).json({
      page_id: page.id,
      ig_business_id: igAccountId,
      ig_profile: igProfile.data,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch IG business data" });
  }
};

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
//     const requiredPermissions = ["pages_show_list", "instagram_basic"];
//     const grantedPermissions = permissionsRes.data.data
//       .filter((perm) => perm.status === "granted")
//       .map((perm) => perm.permission);

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


// instagram-login.js (Vercel Serverless Function)
const axios = require("axios");

module.exports = async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: "Missing code parameter" });
  }

  try {
    const FB_APP_ID = "716889610970681";
    const FB_APP_SECRET = "2fc223957e3ccdcdfceb59311e226adc";
    const REDIRECT_URI = "https://buez-server-khaki.vercel.app/api/instagram-login";

    // Step 1: Exchange code for access token
    const tokenRes = await axios.get("https://graph.facebook.com/v18.0/oauth/access_token", {
      params: {
        client_id: FB_APP_ID,
        client_secret: FB_APP_SECRET,
        redirect_uri: REDIRECT_URI,
        code,
      },
    });

    const access_token = tokenRes.data.access_token;
    console.log("Access Token:", access_token);

    // Step 2: Get basic Facebook user info
    const profileRes = await axios.get("https://graph.facebook.com/me", {
      params: {
        fields: "id,name,picture",
        access_token,
      },
    });

    console.log('profileRes..........', profileRes)
    return res.status(200).json({
      access_token,
      profile: profileRes.data,
    });
  } catch (err) {
    console.error("Facebook Login Error:", err.response?.data || err.message);
    return res.status(500).json({ error: "Facebook login failed." });
  }
};

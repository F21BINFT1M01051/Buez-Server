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

//     console.log('access_token......', access_token)

//     // Step 2: Get user’s pages
//     const pagesRes = await axios.get("https://graph.facebook.com/me/accounts", {
//       params: { access_token },
//     });

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

// /api/instagram-login.js (Node.js for Vercel)

const axios = require("axios");

module.exports = async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: "Missing code parameter" });
  }

  const INSTAGRAM_APP_ID = "1252851839667779";
  const INSTAGRAM_APP_SECRET = "24cd6b58fcca9901615541acf5dbf46d";
  const REDIRECT_URI = "https://buez-server-khaki.vercel.app/api/instagram-login";

  try {
    // Step 1: Exchange code for short-lived access token
    const tokenResponse = await axios.post("https://api.instagram.com/oauth/access_token", null, {
      params: {
        client_id: INSTAGRAM_APP_ID,
        client_secret: INSTAGRAM_APP_SECRET,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
        code,
      },
    });

    const { access_token, user_id } = tokenResponse.data;

    // Step 2: Use token to get basic profile info
    const profileRes = await axios.get(`https://graph.instagram.com/me`, {
      params: {
        fields: "id,username",
        access_token,
      },
    });

    return res.status(200).json({
      access_token,
      profile: profileRes.data,
    });
  } catch (err) {
    console.error("Instagram Login Error:", err.response?.data || err.message);
    return res.status(500).json({ error: "Instagram login failed." });
  }
};

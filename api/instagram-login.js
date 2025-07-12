const axios = require("axios");

module.exports = async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: "Missing code parameter" });
  }

  try {
    const params = new URLSearchParams();
    params.append("client_id", "1252851839667779");
    params.append("client_secret", "24cd6b58fcca9901615541acf5dbf46d");
    params.append("grant_type", "authorization_code");
    params.append("redirect_uri", "https://buez-server-khaki.vercel.app/api/instagram-login");
    params.append("code", code);

    // Exchange code for access token
    const tokenResponse = await axios.post("https://api.instagram.com/oauth/access_token", params);
    const { access_token, user_id } = tokenResponse.data;

    // Fetch profile
    const userResponse = await axios.get(`https://graph.instagram.com/${user_id}`, {
      params: {
        fields: "id,username,account_type",
        access_token,
      },
    });

    return res.status(200).json({
      access_token,
      profile: userResponse.data,
    });
  } catch (error) {
    console.error("Instagram callback error:", error.response?.data || error.message);
    return res.status(500).json({ error: "Failed to authenticate with Instagram" });
  }
};

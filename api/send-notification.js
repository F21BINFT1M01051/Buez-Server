const { Expo } = require("expo-server-sdk");
const expo = new Expo();

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const { expoPushToken, title, message } = req.body;

  if (!Expo.isExpoPushToken(expoPushToken)) {
    return res.status(400).send("Invalid Expo push token");
  }

  try {
    const receipts = await expo.sendPushNotificationsAsync([
      { to: expoPushToken, sound: "default", title, body: message },
    ]);
    console.log("Push receipts:", receipts);
    res.send("Notification sent!");
  } catch (error) {
    console.log("Notification error:", error);
    res.status(500).send("Failed to send notification");
  }
};


import { admin } from "../firebaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { fcmToken, title, body } = req.body;

    if (!fcmToken || !title || !body) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const message = {
      token: fcmToken,
      notification: { title, body },
      android: {
        priority: "high",
        notification: {
          channel_id: "default",
          sound: "default",
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log("FCM send response:", response);

    return res.status(200).json({ success: "Notification sent!", response });
  } catch (error) {
    console.error("Error sending notification:", error);
    return res
      .status(500)
      .json({ error: "Server error", details: error.message });
  }
}

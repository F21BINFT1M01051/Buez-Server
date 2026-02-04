import { customAlphabet } from "nanoid";
import { db } from "../firebaseAdmin.js";
import { admin } from "../firebaseAdmin.js";

// Generate short codes (8 characters, URL-safe)
const nanoid = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  8
);

export default async (req, res) => {
  // Enable CORS
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS,PATCH,DELETE,POST,PUT"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // POST /api/share - Create share link
  if (req.method === "POST") {
    try {
      const { jobId, jobTitle, jobDescription, companyName, userId } = req.body;

      // Validation
      if (!jobId || !jobTitle) {
        return res.status(400).json({
          success: false,
          error: "jobId and jobTitle are required",
        });
      }

      // Check if link already exists for this job
      const existingLinks = await db
        .collection("shareLinks")
        .where("jobId", "==", jobId)
        .limit(1)
        .get();

      let shortCode;
      let shareData;

      if (!existingLinks.empty) {
        // Reuse existing link
        const existingDoc = existingLinks.docs[0];
        shortCode = existingDoc.id;
        shareData = existingDoc.data();

        // Update last shared timestamp
        await db.collection("shareLinks").doc(shortCode).update({
          lastSharedAt: new Date(),
        });
      } else {
        // Create new link
        shortCode = nanoid(); // This now uses your custom 8-char alphabet
        shareData = {
          jobId,
          jobTitle,
          jobDescription: jobDescription || "",
          companyName: companyName || "Buez",
          userId: userId || null,
          clicks: 0,
          shares: 0,
          createdAt: new Date(),
          lastSharedAt: new Date(),
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days expiry
          isActive: true,
        };

        // Save to Firestore
        await db.collection("shareLinks").doc(shortCode).set(shareData);
      }

      const baseUrl = "buez-server-khaki.vercel.app";
      const shareUrl = `https://${baseUrl}/${shortCode}`;

      // Increment share count (FIXED: added admin import)
      await db
        .collection("shareLinks")
        .doc(shortCode)
        .update({
          shares: admin.firestore.FieldValue.increment(1),
        });

      return res.status(200).json({
        success: true,
        shareUrl,
        shortCode,
        jobId,
        createdAt: shareData.createdAt,
        expiresAt: shareData.expiresAt,
      });
    } catch (error) {
      console.error("Share creation error:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to create share link",
        details: error.message,
      });
    }
  }

  // GET /api/share?code=xxx - Get link stats
  if (req.method === "GET") {
    try {
      const { code } = req.query;

      if (!code) {
        return res.status(400).json({
          success: false,
          error: "code parameter required",
        });
      }

      const doc = await db.collection("shareLinks").doc(code).get();

      if (!doc.exists) {
        return res.status(404).json({
          success: false,
          error: "Link not found",
        });
      }

      const data = doc.data();

      // Check if link is expired or inactive
      if (
        !data.isActive ||
        (data.expiresAt && new Date(data.expiresAt.toDate()) < new Date())
      ) {
        return res.status(410).json({
          success: false,
          error: "Link expired or deactivated",
        });
      }

      return res.status(200).json({
        success: true,
        jobId: data.jobId,
        jobTitle: data.jobTitle,
        companyName: data.companyName,
        clicks: data.clicks || 0,
        shares: data.shares || 0,
        createdAt: data.createdAt,
        expiresAt: data.expiresAt,
        isActive: data.isActive,
      });
    } catch (error) {
      console.error("Get stats error:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to get stats",
      });
    }
  }

  return res.status(405).json({
    success: false,
    error: "Method not allowed",
  });
};
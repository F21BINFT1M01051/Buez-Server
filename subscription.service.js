const { Timestamp } = require("firebase-admin/firestore");
const { admin, auth, db } = require("./firebaseAdmin");
const stripe = require("./stripe-server"); // Ensure this is configured

async function saveSubscription(req, res, invoice) {
  const userId = invoice.subscription_details?.metadata?.userId;
  const subscriptionId = invoice.subscription || invoice.id;
  const amountPaid = invoice.amount_paid / 100;
  const currency = invoice.currency;
  const createdAt = new Date(invoice.created * 1000);
  const planId = invoice?.lines?.data[0]?.plan?.id || null;
  const planInterval = invoice?.lines?.data[0]?.plan?.interval || null;
  const productId = invoice?.lines?.data[0]?.plan?.product || null;
  const status = invoice.status;

  console.log("id,..............", userId);

  try {
    // 🔁 Fetch full subscription object to get period dates
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    const now = Math.floor(Date.now() / 1000);
    const isTrial = subscription.trial_end && subscription.trial_end > now;

    const periodStart = new Date(subscription.current_period_start * 1000);
    const periodEnd = new Date(subscription.current_period_end * 1000);

    // Save to subscriptions collection
    await db.collection("subscriptions").doc(subscriptionId).set({
      userId,
      subscriptionId,
      amountPaid,
      currency,
      createdAt,
      planId,
      planInterval,
      productId,
      status,
      periodStart,
      periodEnd,
    });

 
    await db
      .collection("users")
      .doc(userId)
      .update({
        isSubscribed: subscription.status === "active",
        isFreeTrial: isTrial,
        subscriptionStart: periodStart,
        subscriptionEnd: periodEnd,
        subscription: {
          subscriptionDate: Timestamp.now(),
          subscriptionId,
          amountPaid,
          currency,
          createdAt,
          planId,
          planInterval,
          productId,
          status: subscription.status,
        },
        webhook: true,
      });

    console.log(
      `Subscription ${subscriptionId} for User ${userId} saved successfully.`
    );
    res.json({ received: true });
  } catch (error) {
    console.log("Error saving subscription:", error);
    return res.status(500).send("Internal Server Error");
  }
}

module.exports = { saveSubscription };

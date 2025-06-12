const stripe = require("../stripe-server");

module.exports = async (req, res) => {
  if (req.method === "POST") {
    const { subscriptionId } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({ success: false, message: "Subscription ID is required" });
    }

    try {
      // Retrieve subscription details
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);

      const currentTime = Math.floor(Date.now() / 1000); // in seconds
      const trialEnd = subscription.trial_end;

      let canceledSubscription;

      if (trialEnd && currentTime < trialEnd) {
        // 👶 Trial is active: cancel at end of trial (no charge will happen)
        canceledSubscription = await stripe.subscriptions.update(subscriptionId, {
          cancel_at: trialEnd,
        });
      } else {
        // 🧾 Trial is over: cancel at the end of current billing period
        canceledSubscription = await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });
      }

      res.status(200).json({
        success: true,
        message: "Subscription cancellation scheduled successfully",
        canceledSubscription,
      });
    } catch (err) {
      console.error("Cancel Subscription Error:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  } else {
    res.status(405).json({ message: "Method Not Allowed" });
  }
};

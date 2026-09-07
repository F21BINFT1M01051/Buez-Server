const stripe = require("../stripe-server");
const { getPeriodDates } = require("../stripe-periods");

module.exports = async (req, res) => {
  if (req.method === "POST") {
    const { subscriptionId } = req.body;

    if (!subscriptionId) {
      return res
        .status(400)
        .json({ success: false, message: "Subscription ID is required" });
    }

    try {
      // Cancel at the end of the current billing period — the user keeps the
      // access they already paid for (this also naturally ends any remaining
      // discounted intro cycles; no trial logic exists anymore).
      const canceledSubscription = await stripe.subscriptions.update(
        subscriptionId,
        { cancel_at_period_end: true }
      );

      // The app reads result.currentPeriodEnd to keep the stored
      // subscriptionEnd in sync. Send it as an ISO string, matching what the
      // subscribe/upgrade endpoints return.
      const { periodStart, periodEnd } = getPeriodDates(canceledSubscription);

      res.status(200).json({
        success: true,
        message: "Subscription cancellation scheduled successfully",
        subscriptionId: canceledSubscription.id,
        status: canceledSubscription.status,
        isCancelled: canceledSubscription.cancel_at_period_end === true,
        currentPeriodStart: periodStart ? periodStart.toISOString() : null,
        currentPeriodEnd: periodEnd ? periodEnd.toISOString() : null,
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

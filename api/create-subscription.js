const stripe = require("../stripe-server");

module.exports = async (req, res) => {
  if (req.method === "POST") {
    const { customerId, setupIntentId, userId } = req.body;

    try {
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      const paymentMethod = setupIntent.payment_method;

      if (!paymentMethod) {
        throw new Error("No payment method found on SetupIntent");
      }

      // Attach payment method to customer
      await stripe.paymentMethods.attach(paymentMethod, {
        customer: customerId,
      });

      // Set default payment method for customer
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethod,
        },
      });

      // ✅ Create subscription with 14-day trial
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: "price_1RYu67Iqafrl1dqSYbsDzjIa" }],
        default_payment_method: paymentMethod,
        trial_period_days: 14,
        expand: ["latest_invoice"],
        metadata: { userId },
      });

      console.log("Subscription object:", subscription);

      // Get trial end date (if trial is active)
      const trialStart = subscription.trial_start;
      const trialEnd = subscription.trial_end;

      const trialStartDate = new Date(trialStart * 1000).toISOString();
      const trialEndDate = new Date(trialEnd * 1000).toISOString();

      res.status(200).json({
        success: true,
        subscriptionId: subscription.id,
        trialStartDate,
        trialEndDate,
        currentPeriodStart: new Date(
          subscription.current_period_start * 1000
        ).toISOString(),
        currentPeriodEnd: new Date(
          subscription.current_period_end * 1000
        ).toISOString(),
      });
    } catch (err) {
      console.error("Subscription Error:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  } else {
    res.status(405).json({ message: "Method Not Allowed" });
  }
};

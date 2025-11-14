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

      // ✅ Create subscription with NO trial
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: "price_1STRe0Iqafrl1dqSuqgrD7G8" }],
        default_payment_method: paymentMethod,
        expand: ["latest_invoice", "latest_invoice.payment_intent"],
        metadata: { userId },
      });

      console.log("Subscription object:", subscription);

      res.status(200).json({
        success: true,
        subscriptionId: subscription.id,
        status: subscription.status,
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

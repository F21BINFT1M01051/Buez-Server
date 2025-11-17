const stripe = require("../stripe-server");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { customerId, currentSubscriptionId, userId, setupIntentId } = req.body;

  try {
    // 1️⃣ Retrieve current subscription
    const currentSub = await stripe.subscriptions.retrieve(currentSubscriptionId);
    if (!currentSub) {
      return res
        .status(404)
        .json({ success: false, message: "Subscription not found" });
    }

    // 2️⃣ Retrieve customer
    const customer = await stripe.customers.retrieve(customerId);
    let paymentMethod = customer.invoice_settings.default_payment_method;

    // 3️⃣ If customer has no payment method, use SetupIntent → but attach it manually
    if (!paymentMethod) {
      if (!setupIntentId) {
        return res.status(400).json({
          success: false,
          message: "No default payment method. Provide a card via SetupIntent.",
        });
      }

      // Retrieve SI (Stripe does NOT attach PM automatically if customer was not provided)
      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      paymentMethod = setupIntent.payment_method;

      if (!paymentMethod) {
        return res.status(400).json({
          success: false,
          message: "No payment method found on SetupIntent.",
        });
      }

      // 🔥 Attach the new payment method to the customer
      await stripe.paymentMethods.attach(paymentMethod, {
        customer: customerId,
      });

      // 🔥 Set as default
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethod },
      });
    }

    // 4️⃣ Upgrade the existing subscription (DO NOT create a new one)
    const upgradedSub = await stripe.subscriptions.update(currentSubscriptionId, {
      cancel_at_period_end: false,
      items: [
        {
          id: currentSub.items.data[0].id,
          price: "price_1STRe0Iqafrl1dqSuqgrD7G8", // yearly plan
        },
      ],
      proration_behavior: "create_prorations",
      default_payment_method: paymentMethod,
      metadata: { userId },
      expand: ["latest_invoice.payment_intent"],
    });

    res.status(200).json({
      success: true,
      message: "Subscription upgraded successfully",
      subscriptionId: upgradedSub.id,
      status: upgradedSub.status,
      currentPeriodStart: new Date(
        upgradedSub.current_period_start * 1000
      ).toISOString(),
      currentPeriodEnd: new Date(
        upgradedSub.current_period_end * 1000
      ).toISOString(),
    });

  } catch (err) {
    console.error("Upgrade Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

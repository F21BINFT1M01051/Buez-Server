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
      return res.status(404).json({ success: false, message: "Subscription not found" });
    }

    // 2️⃣ Handle SetupIntent payment method
    if (!setupIntentId) {
      return res.status(400).json({
        success: false,
        message: "SetupIntent ID is required.",
      });
    }

    // Retrieve SetupIntent WITH expand
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId, {
      expand: ["payment_method"],
    });

    if (!setupIntent.payment_method) {
      return res.status(400).json({
        success: false,
        message: "SetupIntent contains no payment method.",
      });
    }

    const pm = setupIntent.payment_method;

    // If PM is already attached to another customer → FAIL
    if (pm.customer && pm.customer !== customerId) {
      return res.status(400).json({
        success: false,
        message: "Payment method belongs to another customer.",
      });
    }

    // ❗ IMPORTANT: Attach PM only if needed
    let paymentMethodId = pm.id;
    if (!pm.customer) {
      await stripe.paymentMethods.attach(pm.id, { customer: customerId });
    }

    // Set as default payment method
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pm.id },
    });

    // 3️⃣ Upgrade subscription
    const upgradedSub = await stripe.subscriptions.update(currentSubscriptionId, {
      cancel_at_period_end: false,
      items: [
        {
          id: currentSub.items.data[0].id,
          price: "price_1STRe0Iqafrl1dqSuqgrD7G8",
        },
      ],
      proration_behavior: "create_prorations",
      default_payment_method: pm.id, // Use the payment method ID
      metadata: { userId },
      expand: ["latest_invoice.payment_intent"],
    });

    return res.status(200).json({
      success: true,
      message: "Subscription upgraded successfully",
      subscriptionId: upgradedSub.id,
      status: upgradedSub.status,
      currentPeriodStart: new Date(upgradedSub.current_period_start * 1000).toISOString(),
      currentPeriodEnd: new Date(upgradedSub.current_period_end * 1000).toISOString(),
    });

  } catch (err) {
    console.error("Upgrade Error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
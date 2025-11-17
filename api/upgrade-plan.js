const stripe = require("../stripe-server");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { customerId, currentSubscriptionId, userId, setupIntentId } = req.body;

  try {
    console.log("Starting upgrade process...");
    console.log("Customer ID:", customerId);
    console.log("Subscription ID:", currentSubscriptionId);
    console.log("SetupIntent ID:", setupIntentId);

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

    console.log("SetupIntent status:", setupIntent.status);
    console.log("SetupIntent payment method:", setupIntent.payment_method?.id);

    if (!setupIntent.payment_method) {
      return res.status(400).json({
        success: false,
        message: "SetupIntent contains no payment method.",
      });
    }

    const pm = setupIntent.payment_method;
    console.log("Payment method ID:", pm.id);
    console.log("Payment method customer:", pm.customer);

    // Check if payment method is already attached to this customer
    if (pm.customer && pm.customer !== customerId) {
      return res.status(400).json({
        success: false,
        message: "Payment method belongs to another customer.",
      });
    }

    let paymentMethodId = pm.id;

    // If payment method is not attached to any customer, attach it
    if (!pm.customer) {
      console.log("Attaching payment method to customer...");
      try {
        await stripe.paymentMethods.attach(pm.id, { 
          customer: customerId 
        });
        console.log("Payment method attached successfully");
      } catch (attachError) {
        console.error("Error attaching payment method:", attachError);
        return res.status(400).json({
          success: false,
          message: `Failed to attach payment method: ${attachError.message}`,
        });
      }
    } else {
      console.log("Payment method already attached to customer");
    }

    // Set as default payment method
    console.log("Setting as default payment method...");
    try {
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: pm.id },
      });
      console.log("Default payment method set successfully");
    } catch (updateError) {
      console.error("Error setting default payment method:", updateError);
      return res.status(400).json({
        success: false,
        message: `Failed to set default payment method: ${updateError.message}`,
      });
    }

    // Verify the payment method is properly attached
    console.log("Verifying payment method attachment...");
    try {
      const verifiedPaymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });
      
      const isAttached = verifiedPaymentMethods.data.some(paymentMethod => 
        paymentMethod.id === pm.id
      );
      
      console.log("Attached payment methods:", verifiedPaymentMethods.data.map(p => p.id));
      console.log("Target payment method attached:", isAttached);

      if (!isAttached) {
        return res.status(400).json({
          success: false,
          message: "Payment method verification failed - not attached to customer.",
        });
      }
    } catch (verifyError) {
      console.error("Error verifying payment method:", verifyError);
      return res.status(400).json({
        success: false,
        message: `Failed to verify payment method: ${verifyError.message}`,
      });
    }

    // 3️⃣ Upgrade subscription
    console.log("Upgrading subscription...");
    const upgradedSub = await stripe.subscriptions.update(currentSubscriptionId, {
      cancel_at_period_end: false,
      items: [
        {
          id: currentSub.items.data[0].id,
          price: "price_1STRe0Iqafrl1dqSuqgrD7G8", // Yearly price
        },
      ],
      proration_behavior: "create_prorations",
      default_payment_method: pm.id,
      metadata: { userId },
      expand: ["latest_invoice.payment_intent"],
    });

    console.log("Subscription upgraded successfully:", upgradedSub.id);

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
    return res.status(500).json({ 
      success: false, 
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};
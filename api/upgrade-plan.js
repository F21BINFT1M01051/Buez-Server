const stripe = require("../stripe-server");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { customerId, currentSubscriptionId, userId, setupIntentId } = req.body;

  try {
    console.log("🔹 Starting upgrade process...");
    console.log("Customer ID:", customerId);
    console.log("Subscription ID:", currentSubscriptionId);
    console.log("SetupIntent ID:", setupIntentId);

    // 1️⃣ Retrieve current subscription
    const currentSub = await stripe.subscriptions.retrieve(currentSubscriptionId);
    if (!currentSub) {
      return res.status(404).json({ success: false, message: "Subscription not found" });
    }

    // 2️⃣ Get the payment method from SetupIntent WITHOUT expand
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    console.log("SetupIntent status:", setupIntent.status);
    console.log("Payment method ID from SetupIntent:", setupIntent.payment_method);

    if (!setupIntent.payment_method) {
      return res.status(400).json({
        success: false,
        message: "SetupIntent contains no payment method.",
      });
    }

    const paymentMethodId = setupIntent.payment_method;

    // 3️⃣ Check if this payment method is already attached to the customer
    let isAttachedToCustomer = false;
    try {
      const customerPaymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
      });
      
      isAttachedToCustomer = customerPaymentMethods.data.some(pm => pm.id === paymentMethodId);
      console.log("Payment method already attached to customer:", isAttachedToCustomer);
      console.log("Customer's payment methods:", customerPaymentMethods.data.map(pm => pm.id));
    } catch (error) {
      console.log("Error listing customer payment methods:", error.message);
    }

    // 4️⃣ If not attached, attach it
    if (!isAttachedToCustomer) {
      console.log("🔹 Attaching payment method to customer...");
      try {
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: customerId,
        });
        console.log("✅ Payment method attached successfully");
      } catch (attachError) {
        console.error("❌ Error attaching payment method:", attachError);
        
        // If it's already attached error, continue
        if (attachError.code === 'payment_method_already_attached') {
          console.log("⚠️ Payment method already attached, continuing...");
        } else {
          return res.status(400).json({
            success: false,
            message: `Failed to attach payment method: ${attachError.message}`,
          });
        }
      }
    }

    // 5️⃣ Set as default payment method
    console.log("🔹 Setting as default payment method...");
    try {
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
      console.log("✅ Default payment method set successfully");
    } catch (updateError) {
      console.error("❌ Error setting default payment method:", updateError);
      return res.status(400).json({
        success: false,
        message: `Failed to set default payment method: ${updateError.message}`,
      });
    }

    // 6️⃣ Double-check the payment method is available
    console.log("🔹 Verifying payment method availability...");
    try {
      const finalCheck = await stripe.paymentMethods.retrieve(paymentMethodId);
      console.log("Payment method customer after attachment:", finalCheck.customer);
      
      if (finalCheck.customer !== customerId) {
        throw new Error(`Payment method attached to wrong customer. Expected: ${customerId}, Got: ${finalCheck.customer}`);
      }
    } catch (verifyError) {
      console.error("❌ Payment method verification failed:", verifyError);
      return res.status(400).json({
        success: false,
        message: `Payment method verification failed: ${verifyError.message}`,
      });
    }

    // 7️⃣ Upgrade subscription with explicit payment method
    console.log("🔹 Upgrading subscription...");
    const upgradedSub = await stripe.subscriptions.update(currentSubscriptionId, {
      cancel_at_period_end: false,
      items: [
        {
          id: currentSub.items.data[0].id,
          price: "price_1STRe0Iqafrl1dqSuqgrD7G8",
        },
      ],
      proration_behavior: "create_prorations",
      default_payment_method: paymentMethodId,
      metadata: { 
        userId,
        upgradedFrom: currentSub.items.data[0].price.id,
        upgradedAt: new Date().toISOString()
      },
      expand: ["latest_invoice.payment_intent"],
    });

    console.log("✅ Subscription upgraded successfully:", upgradedSub.id);
    console.log("New subscription status:", upgradedSub.status);

    return res.status(200).json({
      success: true,
      message: "Subscription upgraded successfully",
      subscriptionId: upgradedSub.id,
      status: upgradedSub.status,
      currentPeriodStart: new Date(upgradedSub.current_period_start * 1000).toISOString(),
      currentPeriodEnd: new Date(upgradedSub.current_period_end * 1000).toISOString(),
      invoiceStatus: upgradedSub.latest_invoice?.status,
      paymentIntentStatus: upgradedSub.latest_invoice?.payment_intent?.status,
    });

  } catch (err) {
    console.error("❌ Upgrade Error:", err);
    return res.status(500).json({ 
      success: false, 
      message: err.message,
      type: err.type,
      code: err.code
    });
  }
};
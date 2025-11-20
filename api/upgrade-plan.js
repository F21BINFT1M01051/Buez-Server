const stripe = require("../stripe-server");

const YEARLY_PRICE_IDS = {
  USD: "price_1SVXeiIqafrl1dqSh7sOIies",
  EUR: "price_1SVXeLIqafrl1dqSBY5r8AC2",
  CHF: "price_1SVXdwIqafrl1dqSK8QjArLi",
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  const { customerId, currentSubscriptionId, userId, setupIntentId, currency } =
    req.body;

  try {
    // Retrieve current subscription
    const currentSub = await stripe.subscriptions.retrieve(
      currentSubscriptionId
    );
    if (!currentSub) {
      return res
        .status(404)
        .json({ success: false, message: "Subscription not found" });
    }

    //Retrieve customer
    const customer = await stripe.customers.retrieve(customerId);
    let paymentMethod = customer.invoice_settings.default_payment_method;

    //If no payment method, use SetupIntent
    if (!paymentMethod) {
      if (!setupIntentId) {
        return res.status(400).json({
          success: false,
          message: "No default payment method. Provide a card via SetupIntent.",
        });
      }

      const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
      paymentMethod = setupIntent.payment_method;

      if (!paymentMethod) {
        return res.status(400).json({
          success: false,
          message: "No payment method found on SetupIntent.",
        });
      }

      // Attach payment method and set as default
      await stripe.paymentMethods.attach(paymentMethod, {
        customer: customerId,
      });
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethod },
      });
    }

    // Determine yearly price for user's currency
    const priceId = YEARLY_PRICE_IDS[currency || "USD"];
    if (!priceId) {
      return res
        .status(400)
        .json({ success: false, message: "Price ID not found for currency" });
    }

    //  Update current subscription to remove old items and prorate
    // Stripe allows us to update the subscription with a new price directly
    const updatedSub = await stripe.subscriptions.update(
      currentSubscriptionId,
      {
        cancel_at_period_end: false,
        items: [
          {
            id: currentSub.items.data[0].id,
            price: priceId,
          },
        ],
        proration_behavior: "create_prorations", // ⚡ proration will credit unused portion
        default_payment_method: paymentMethod,
        expand: ["latest_invoice.payment_intent"],
      }
    );

    res.status(200).json({
      success: true,
      message: "Subscription upgraded successfully",
      subscriptionId: updatedSub.id,
      status: updatedSub.status,
      currentPeriodStart: new Date(
        updatedSub.current_period_start * 1000
      ).toISOString(),
      currentPeriodEnd: new Date(
        updatedSub.current_period_end * 1000
      ).toISOString(),
      prorationInvoice: updatedSub.latest_invoice,
    });
  } catch (err) {
    console.error("Upgrade Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

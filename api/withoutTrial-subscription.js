const stripe = require("../stripe-server");

const PRICE_IDS = {
  monthly: {
    USD: "price_1TOhryIqafrl1dqS9HIgtJrM",
    EUR: "price_1TOhsnIqafrl1dqSLdCgW147",
    CHF: "price_1TOhovIqafrl1dqSq0bvhFO0",
  },
  yearly: {
    USD: "price_1TOi2bIqafrl1dqSNuVbnF7B",
    EUR: "price_1TOi36Iqafrl1dqS1MFxuB7H",
    CHF: "price_1TOi1oIqafrl1dqSEn97FnpA",
  },
};

module.exports = async (req, res) => {
  if (req.method === "POST") {
    const { customerId, setupIntentId, userId } = req.body;

    const userCurrency = req.body.currency || "USD"; // default USD
    const planType = req.body.planType; // "monthly" or "yearly"

    const priceId = PRICE_IDS[planType][userCurrency];
    if (!priceId) throw new Error("Price ID not found for selected currency");

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

      //Create subscription with NO trial
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
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

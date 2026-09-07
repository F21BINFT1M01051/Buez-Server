const stripe = require("../stripe-server");
const { buffer } = require("micro"); // For Vercel

const {
  saveSubscription,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handlePaymentFailed,
} = require("../subscription.service");

export const config = {
  api: {
    bodyParser: false,
  },
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, endpointSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // event.created lets the handlers drop out-of-order deliveries: this
  // endpoint is subscribed to ALL events and Stripe does not guarantee order.
  const meta = { eventId: event.id, eventCreated: event.created };

  try {
    switch (event.type) {
      // Grants access. Fires on the first payment and on every renewal.
      case "invoice.payment_succeeded":
        console.log("invoice.payment_succeeded:", event.data.object.id);
        await saveSubscription(event.data.object, meta);
        break;

      // Cancellation scheduled/reverted, plan change, status change.
      case "customer.subscription.updated":
        console.log("customer.subscription.updated:", event.data.object.id);
        await handleSubscriptionUpdated(event.data.object, meta);
        break;

      // Period actually ended — this is what revokes access.
      case "customer.subscription.deleted":
        console.log("customer.subscription.deleted:", event.data.object.id);
        await handleSubscriptionDeleted(event.data.object, meta);
        break;

      // Renewal failed. Access is left alone; the app gates on subscriptionEnd.
      case "invoice.payment_failed":
        console.log("invoice.payment_failed:", event.data.object.id);
        await handlePaymentFailed(event.data.object);
        break;

      // customer.subscription.created is deliberately NOT handled: it carries
      // a Subscription (no amount_paid), fires before payment, and webhook
      // delivery is unordered, so it could overwrite a paid record with
      // status "incomplete". invoice.payment_succeeded covers activation.
      // This endpoint is subscribed to ALL Stripe events, so most deliveries
      // land here. Logged at debug volume only; nothing is written.
      default:
        break;
    }

    if (!res.headersSent) {
      res.status(200).json({ received: true });
    }
  } catch (err) {
    console.error("Webhook handler failed:", err);

    if (!res.headersSent) {
      res.status(500).send("Webhook handler failed");
    }
  }
};

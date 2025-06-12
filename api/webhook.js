const stripe = require("../stripe-server");
const { buffer } = require("micro"); // For Vercel

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

  try {
    switch (event.type) {
      case "invoice.payment_succeeded":
        console.log("✅ invoice.payment_succeeded:", event.data.object);
        await saveSubscription(req, res, event.data.object);
        break;

      case "customer.subscription.created":
        console.log("✅ Subscription created:", event.data.object);
        await saveSubscription(req, res, event.data.object);
        // Optional: You can also save or log this event if needed
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).send("Webhook received");
  } catch (err) {
    console.error("Webhook handler failed:", err.message);
    res.status(500).send("Webhook handler failed");
  }
};

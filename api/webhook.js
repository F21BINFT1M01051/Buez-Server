const stripe = require("../stripe-server");
const { buffer } = require("micro"); // micro is built-in with Vercel deployments
const { saveSubscription } = require("../subscription.service");

export const config = {
  api: {
    bodyParser: false, // Required for Stripe
  },
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    const buf = await buffer(req); // ✅ Get raw body
    event = stripe.webhooks.constructEvent(buf, sig, endpointSecret); // ✅ Use raw buffer here
  } catch (err) {
    console.log("Webhook error", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case "invoice.payment_succeeded":
      console.log("Invoice succeeded:", event.data.object);
      await saveSubscription(req, res, event.data.object);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.status(200).send("Received");
};

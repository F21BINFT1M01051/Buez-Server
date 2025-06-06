const express = require("express");
require("dotenv").config();
const app = express();
// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const stripe = require("./stripe-server");
const { admin, auth, db } = require("./firebaseAdmin");
const { saveSubscription } = require("./subscription.service");
const { Expo } = require("expo-server-sdk");
const expo = new Expo();

// This is your Stripe CLI webhook secret for testing your endpoint locally.whsec_0e25053ef306d4071cdce0ef09bdf5a14ce0c56654c61335449d196a8d7a1e8c
const endpointSecret = "whsec_3261b690db87198db5b1b7720d21f895383c294cd1659a85f6f751cec1eee8fd";

app.post("/webhook", express.raw({ type: "application/json" }), async (request, response, next) => {
  const sig = request.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(request.body, sig, endpointSecret);
  } catch (err) {
    console.log(err);

    response.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  // console.log('event', event);
  // Handle the event
  switch (event.type) {
    case "payment_intent.succeeded":
      const paymentIntentSucceeded = event.data.object;
      console.log("paymentIntentSucceeded", paymentIntentSucceeded);
      await saveSubscription(request, response, paymentIntentSucceeded);
      break;
    // case 'charge.succeeded':
    // 	const charge = event.data.object;
    // 	const invoiceId = charge.invoice; // Check if it's linked to an invoice

    // 	if (invoiceId) {
    // 		console.log(`🔍 Charge is linked to invoice: ${invoiceId}`);

    // 		// Fetch invoice details from Stripe API
    // 		const invoice = await stripe.invoices.retrieve(invoiceId);
    // 		const subscriptionId = invoice.subscription;
    // 	}
    // 	break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  response.send();
});

app.use(express.json());

app.post("/payment-sheet", async (req, res) => {
  const { amount, userId } = req.body;
  console.log("amount", amount);
  const customer = await stripe.customers.create();
  const ephemeralKey = await stripe.ephemeralKeys.create({ customer: customer.id }, { apiVersion: "2024-12-18.acacia" });
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount * 100,
    currency: "usd",
    customer: customer.id,
    metadata: { userId: userId },
  });

  console.log("paymentIntent", paymentIntent);
  return res.status(200).json({
    customer: customer.id,
    ephemeralKey: ephemeralKey.secret,
    paymentIntent: paymentIntent.client_secret,
  });
});

app.post("/send-notification", async (req, res) => {
  const { expoPushToken, title, message } = req.body;
  console.log("Received push token:", expoPushToken);
  console.log("Title:", title, "Message:", message);

  if (!Expo.isExpoPushToken(expoPushToken)) {
    return res.status(400).send("Invalid Expo push token");
  }

  const messages = [
    {
      to: expoPushToken,
      sound: "default",
      title: title,
      body: message,
    },
  ];

  try {
    const receipts = await expo.sendPushNotificationsAsync(messages);
    console.log("Push receipts:", receipts);
    res.send("Notification sent!");
  } catch (error) {
    console.error("Notification error:", error);
    res.status(500).send("Failed to send notification");
  }
});

app.listen(process.env.PORT, () => console.log(`Running on port ${process.env.PORT}`));

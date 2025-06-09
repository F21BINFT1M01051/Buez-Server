const stripe = require("../stripe-server");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const { amount, userId } = req.body;

  const customer = await stripe.customers.create();
  const ephemeralKey = await stripe.ephemeralKeys.create(
    { customer: customer.id },
    { apiVersion: "2024-12-18.acacia" }
  );
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amount * 100,
    currency: "usd",
    customer: customer.id,
    metadata: { userId },
  });

  return res.status(200).json({
    customer: customer.id,
    ephemeralKey: ephemeralKey.secret,
    paymentIntent: paymentIntent.client_secret,
  });
};

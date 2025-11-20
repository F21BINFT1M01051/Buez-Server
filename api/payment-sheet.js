const stripe = require("../stripe-server");

module.exports = async (req, res) => {
  if (req.method === "POST") {
    const { email, userId } = req.body;

    try {
      const customer = await stripe.customers.create({
        email,
        metadata: { userId },
      });
      const setupIntent = await stripe.setupIntents.create({
        customer: customer.id,
        payment_method_types: ["card"],
      });
      res.status(200).json({
        setupIntentClientSecret: setupIntent.client_secret,
        customerId: customer.id,
      });
    } catch (error) {
      console.error("SetupIntent Error:", error);
      res.status(500).json({ error: error.message });
    }
  } else {
    res.status(405).json({ message: "Method Not Allowed" });
  }
};

const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-12-18.acacia",
  appInfo: {
    name: "Buez",
  },
});

module.exports = stripe;
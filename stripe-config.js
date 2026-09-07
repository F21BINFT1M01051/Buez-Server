
const PRICE_IDS = {
  monthly: {
    USD: process.env.STRIPE_PRICE_MONTHLY_USD || "price_1U6CaFIqafrl1dqSubo6wxd2",
    EUR: process.env.STRIPE_PRICE_MONTHLY_EUR || "price_1U6Cb4Iqafrl1dqSorxsgaff",
    CHF: process.env.STRIPE_PRICE_MONTHLY_CHF || "price_1U6CanIqafrl1dqSgY61puAE",
  },
  yearly: {
    USD: process.env.STRIPE_PRICE_YEARLY_USD || "price_1U6CcrIqafrl1dqSqwOXLUEP",
    EUR: process.env.STRIPE_PRICE_YEARLY_EUR || "price_1U6CdSIqafrl1dqS7WM6F5Mg",
    CHF: process.env.STRIPE_PRICE_YEARLY_CHF || "price_1U6Cd9Iqafrl1dqSdpF7MegO",
  },
};

const INTRO_COUPON_IDS = {
  USD: process.env.STRIPE_INTRO_COUPON_USD || "0qLs8nHU",
  EUR: process.env.STRIPE_INTRO_COUPON_EUR || "ox5MxyUk",
  CHF: process.env.STRIPE_INTRO_COUPON_CHF || "jxYmw8JR",
};

module.exports = { PRICE_IDS, INTRO_COUPON_IDS };


const PRICE_IDS = {
  monthly: {
    USD: process.env.STRIPE_PRICE_MONTHLY_USD || "price_1TtultIqafrl1dqSaMq4TNCR",
    EUR: process.env.STRIPE_PRICE_MONTHLY_EUR || "price_1Ttun0Iqafrl1dqSL8u2wVAr",
    CHF: process.env.STRIPE_PRICE_MONTHLY_CHF || "price_1TtumdIqafrl1dqSag0KGIwD",
  },
  yearly: {
    USD: process.env.STRIPE_PRICE_YEARLY_USD || "price_1TtunbIqafrl1dqSaXCpY4RN",
    EUR: process.env.STRIPE_PRICE_YEARLY_EUR || "price_1TtuoDIqafrl1dqSpbNiiL1S",
    CHF: process.env.STRIPE_PRICE_YEARLY_CHF || "price_1TtunqIqafrl1dqSps1BMgXy",
  },
};

const INTRO_COUPON_IDS = {
  USD: process.env.STRIPE_INTRO_COUPON_USD || "leLXJqlN",
  EUR: process.env.STRIPE_INTRO_COUPON_EUR || "ksyCC4Yg",
  CHF: process.env.STRIPE_INTRO_COUPON_CHF || "rv35lDrU",
};

module.exports = { PRICE_IDS, INTRO_COUPON_IDS };

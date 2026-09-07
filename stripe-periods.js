/**
 * Period-date helpers for Stripe subscriptions.
 *
 * Kept in its own module (no Firebase import) so the subscription endpoints
 * can use it without pulling in firebaseAdmin and running initializeApp().
 */

/**
 * Stripe moved current_period_* from the subscription to its items in newer
 * API versions. Read the subscription level first, then fall back to item 0,
 * then to the latest invoice period. Returns Date objects (or null).
 */
function getPeriodDates(subscription) {
  const item = subscription?.items?.data?.[0];
  const invoice =
    typeof subscription?.latest_invoice === "object"
      ? subscription.latest_invoice
      : null;

  const startSec =
    subscription?.current_period_start ??
    item?.current_period_start ??
    invoice?.period_start ??
    null;

  const endSec =
    subscription?.current_period_end ??
    item?.current_period_end ??
    invoice?.period_end ??
    null;

  return {
    periodStart: startSec ? new Date(startSec * 1000) : null,
    periodEnd: endSec ? new Date(endSec * 1000) : null,
  };
}

/** "month" -> "monthly", "year" -> "yearly" (matches the client's planType). */
function toPlanType(interval) {
  if (interval === "month") return "monthly";
  if (interval === "year") return "yearly";
  return null;
}

module.exports = { getPeriodDates, toPlanType };

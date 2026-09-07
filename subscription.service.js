const { Timestamp } = require("firebase-admin/firestore");
const { admin, auth, db } = require("./firebaseAdmin");
const stripe = require("./stripe-server"); // Ensure this is configured
const { getPeriodDates, toPlanType } = require("./stripe-periods");

/**
 * userId lives in metadata, but the shape differs by object type and API
 * version. Falls back to the subscriptions collection, which we own.
 */
async function resolveUserId(object, subscriptionId) {
  const fromMetadata =
    object?.metadata?.userId ||
    object?.subscription_details?.metadata?.userId ||
    object?.parent?.subscription_details?.metadata?.userId;

  if (fromMetadata) return fromMetadata;

  if (!subscriptionId) return null;

  try {
    const snap = await db.collection("subscriptions").doc(subscriptionId).get();
    return snap.exists ? snap.data()?.userId || null : null;
  } catch (error) {
    console.error("resolveUserId: subscriptions lookup failed:", error);
    return null;
  }
}

/**
 * Writes the user's access state.
 *
 * The webhook endpoint receives ALL Stripe events and delivery is NOT ordered,
 * so two guards protect the fields the app gates on:
 *
 *  1. Watermark — `subscriptionEventAt` holds the Stripe `event.created` of
 *     the last access-state write. An older event is dropped, so a stale
 *     `customer.subscription.updated` (status "incomplete") can never land
 *     after the `invoice.payment_succeeded` that activated the user.
 *
 *  2. Ownership — for update/delete events, skip when the user has already
 *     moved on to a different subscription id, so a late "deleted" for an old
 *     subscription can't revoke a freshly purchased one.
 *
 * Runs in a transaction: read and write must not interleave with a
 * concurrently delivered event.
 */
async function updateUserSubscriptionState(userId, fields, options = {}) {
  const { eventCreated = null, requireSubscriptionId = null } = options;
  const ref = db.collection("users").doc(userId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;

    if (typeof eventCreated === "number") {
      const lastEventAt = data?.subscriptionEventAt;
      if (typeof lastEventAt === "number" && lastEventAt > eventCreated) {
        console.warn(
          `Skipping out-of-order event for user ${userId} (event ${eventCreated} older than stored ${lastEventAt}).`
        );
        return { written: false, reason: "stale_event" };
      }
    }

    if (requireSubscriptionId) {
      const current = data?.subscriptionId;
      if (current && current !== requireSubscriptionId) {
        console.warn(
          `Skipping event for subscription ${requireSubscriptionId}: user ${userId} is now on ${current}.`
        );
        return { written: false, reason: "superseded_subscription" };
      }
    }

    tx.set(
      ref,
      {
        ...fields,
        ...(typeof eventCreated === "number"
          ? { subscriptionEventAt: eventCreated }
          : {}),
      },
      { merge: true }
    );

    return { written: true };
  });
}

/**
 * invoice.payment_succeeded — initial payment and every renewal.
 * This is the only event that grants access.
 */
async function saveSubscription(invoice, meta = {}) {
  const subscriptionId = invoice.subscription || invoice.id;
  const userId = await resolveUserId(invoice, subscriptionId);

  // customer.subscription.* deliver a Subscription (no amount_paid).
  const amountPaid =
    typeof invoice.amount_paid === "number" ? invoice.amount_paid / 100 : 0;
  const currency = invoice.currency;
  const createdAt = new Date(invoice.created * 1000);
  const planId = invoice?.lines?.data?.[0]?.plan?.id || null;
  const planInterval = invoice?.lines?.data?.[0]?.plan?.interval || null;
  const productId = invoice?.lines?.data?.[0]?.plan?.product || null;
  const status = invoice.status;

  // Nothing to attach this payment to. Don't throw: Stripe would keep
  // retrying an event that can never succeed.
  if (!userId) {
    console.error(
      `saveSubscription: no userId for invoice ${invoice.id} (subscription ${subscriptionId}). Skipping.`
    );
    return { skipped: true, reason: "missing_user_id", subscriptionId };
  }

  if (!subscriptionId) {
    console.error(
      `saveSubscription: no subscriptionId for invoice ${invoice.id}. Skipping.`
    );
    return { skipped: true, reason: "missing_subscription_id", userId };
  }

  try {
    // Fetch full subscription object to get period dates and live status
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    const { periodStart, periodEnd } = getPeriodDates(subscription);

    if (!periodStart || !periodEnd) {
      console.warn(
        `saveSubscription: period dates unavailable for subscription ${subscriptionId}.`
      );
    }

    const planType =
      toPlanType(planInterval) ||
      toPlanType(subscription?.items?.data?.[0]?.plan?.interval);

    // merge so an out-of-order event can't wipe fields already stored
    await db
      .collection("subscriptions")
      .doc(subscriptionId)
      .set(
        {
          userId,
          subscriptionId,
          amountPaid,
          currency,
          createdAt,
          planId,
          planInterval,
          productId,
          status,
          periodStart,
          periodEnd,
        },
        { merge: true }
      );

    // Field names must match what the app reads (decideLoginRoute /
    // InitialRoute gate on isSubscribed + subscriptionStart/End).
    // No ownership guard here: a payment is what CLAIMS the subscription, so
    // a resubscribe must be allowed to replace an older subscriptionId.
    const result = await updateUserSubscriptionState(
      userId,
      {
        isSubscribed: subscription.status === "active",
        isCancelled: subscription.cancel_at_period_end === true,
        paymentFailed: false, // a successful payment clears any prior failure
        subscriptionId,
        ...(planType ? { planType } : {}),
        ...(periodStart ? { subscriptionStart: periodStart } : {}),
        ...(periodEnd ? { subscriptionEnd: periodEnd } : {}),
        subscription: {
          subscriptionDate: Timestamp.now(),
          subscriptionId,
          amountPaid,
          currency,
          createdAt,
          planId,
          planInterval,
          productId,
          status: subscription.status,
        },
        webhook: true,
      },
      { eventCreated: meta.eventCreated }
    );

    console.log(
      `Subscription ${subscriptionId} for User ${userId} saved (written: ${result.written}).`
    );

    return { skipped: false, subscriptionId, userId, ...result };
  } catch (error) {
    console.error("Error saving subscription:", error);
    throw error;
  }
}

/**
 * customer.subscription.updated — cancellation scheduled/reverted, plan
 * change, status change (past_due, unpaid, canceled).
 * Keeps isCancelled in sync even when the app's own write never landed.
 */
async function handleSubscriptionUpdated(subscription, meta = {}) {
  const subscriptionId = subscription.id;
  const userId = await resolveUserId(subscription, subscriptionId);

  if (!userId) {
    console.error(
      `handleSubscriptionUpdated: no userId for subscription ${subscriptionId}. Skipping.`
    );
    return { skipped: true, reason: "missing_user_id", subscriptionId };
  }

  const { periodStart, periodEnd } = getPeriodDates(subscription);
  const planType = toPlanType(subscription?.items?.data?.[0]?.plan?.interval);
  const isActive = ["active", "trialing"].includes(subscription.status);

  try {
    await db
      .collection("subscriptions")
      .doc(subscriptionId)
      .set(
        {
          userId,
          subscriptionId,
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
          periodStart,
          periodEnd,
        },
        { merge: true }
      );

    const result = await updateUserSubscriptionState(
      userId,
      {
        isSubscribed: isActive,
        isCancelled: subscription.cancel_at_period_end === true,
        subscriptionId,
        ...(planType ? { planType } : {}),
        ...(periodStart ? { subscriptionStart: periodStart } : {}),
        ...(periodEnd ? { subscriptionEnd: periodEnd } : {}),
        webhook: true,
      },
      { eventCreated: meta.eventCreated, requireSubscriptionId: subscriptionId }
    );

    console.log(
      `Subscription ${subscriptionId} updated for User ${userId} (status: ${subscription.status}, cancelAtPeriodEnd: ${subscription.cancel_at_period_end}, written: ${result.written}).`
    );

    return { skipped: false, subscriptionId, userId, ...result };
  } catch (error) {
    console.error("Error handling subscription update:", error);
    throw error;
  }
}

/**
 * customer.subscription.deleted — the period has actually ended.
 * This is what finally revokes access.
 */
async function handleSubscriptionDeleted(subscription, meta = {}) {
  const subscriptionId = subscription.id;
  const userId = await resolveUserId(subscription, subscriptionId);

  if (!userId) {
    console.error(
      `handleSubscriptionDeleted: no userId for subscription ${subscriptionId}. Skipping.`
    );
    return { skipped: true, reason: "missing_user_id", subscriptionId };
  }

  const endedAt = subscription.ended_at
    ? new Date(subscription.ended_at * 1000)
    : getPeriodDates(subscription).periodEnd;

  try {
    await db
      .collection("subscriptions")
      .doc(subscriptionId)
      .set(
        {
          userId,
          subscriptionId,
          status: subscription.status, // "canceled"
          endedAt: endedAt || null,
        },
        { merge: true }
      );

    // requireSubscriptionId: never revoke access for a subscription the user
    // has already replaced (resubscribe, or upgrade to a new subscription).
    const result = await updateUserSubscriptionState(
      userId,
      {
        isSubscribed: false,
        isCancelled: true,
        ...(endedAt ? { subscriptionEnd: endedAt } : {}),
        webhook: true,
      },
      { eventCreated: meta.eventCreated, requireSubscriptionId: subscriptionId }
    );

    console.log(
      `Subscription ${subscriptionId} deleted for User ${userId} (access revoked: ${result.written}).`
    );

    return { skipped: false, subscriptionId, userId, ...result };
  } catch (error) {
    console.error("Error handling subscription deletion:", error);
    throw error;
  }
}

/**
 * invoice.payment_failed — a renewal did not go through. Access is NOT
 * revoked here: the app gates on subscriptionEnd, so the user keeps the
 * period they paid for while Stripe retries. Recorded for visibility.
 */
async function handlePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription || invoice.id;
  const userId = await resolveUserId(invoice, subscriptionId);

  console.warn(
    `invoice.payment_failed for subscription ${subscriptionId} (user ${userId || "unknown"}), attempt ${invoice.attempt_count}.`
  );

  if (!userId || !subscriptionId) {
    return { skipped: true, reason: "missing_user_id", subscriptionId };
  }

  try {
    await db
      .collection("subscriptions")
      .doc(subscriptionId)
      .set(
        {
          userId,
          subscriptionId,
          lastPaymentFailedAt: Timestamp.now(),
          lastPaymentFailureAttempt: invoice.attempt_count || null,
          status: invoice.status,
        },
        { merge: true }
      );

    // No watermark: this only flags a failure, it never touches the fields
    // the app gates access on.
    await db
      .collection("users")
      .doc(userId)
      .set({ paymentFailed: true, webhook: true }, { merge: true });

    return { skipped: false, subscriptionId, userId };
  } catch (error) {
    console.error("Error handling payment failure:", error);
    throw error;
  }
}

module.exports = {
  saveSubscription,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handlePaymentFailed,
  getPeriodDates,
};

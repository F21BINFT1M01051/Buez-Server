const { Timestamp, updateDoc } = require('firebase-admin/firestore');
const { admin, auth, db } = require('./firebaseAdmin');

async function saveSubscription(req, res, invoice) {
	const userId = invoice.metadata.userId; // Stripe Customer ID
	const subscriptionId = invoice.id;
	const amountPaid = invoice.amount / 100; // Convert cents to dollars
	const currency = invoice.currency;
	const createdAt = new Date(invoice.created * 1000); // Convert UNIX timestamp to Date
	const planId = invoice?.lines?.data[0]?.plan?.id || null;
	const planInterval = invoice?.lines?.data[0]?.plan?.interval || null;
	const productId = invoice?.lines?.data[0]?.plan?.product || null;
	const status = invoice.status;

	console.log('request', {
		userId,
		subscriptionId,
		amountPaid,
		currency,
		createdAt,
		planId,
		planInterval,
		productId,
		status,
	});
	try {
		await db.collection('subscriptions').doc(subscriptionId).set({
			userId,
			subscriptionId,
			amountPaid,
			currency,
			createdAt,
			planId,
			planInterval,
			productId,
			status: status,
		});

		await db
			.collection('users')
			.doc(userId)
			.update({
				subscription: {
					subscriptionDate: Timestamp.now(),
					subscriptionId,
					amountPaid,
					currency,
					createdAt,
					planId,
					planInterval,
					productId,
					status: 'active',
				},
			});

		console.log(`Subscription ${subscriptionId} for User ${userId} saved successfully.`);
	} catch (error) {
		console.error('Error saving subscription:', error);
		return res.status(500).send('Internal Server Error');
	}

	res.json({ received: true });
}

module.exports = { saveSubscription };

const { doc, setDoc, getDoc, updateDoc, onSnapshot } = require('firebase/firestore');
// FIREBASE config
const { FIREBASE_DB, FIREBASE_AUTH } = require("./firebaseConfig");

const db = FIREBASE_DB;


const saveSubscription = async (userId, subscriptionId) => {
  const userRef = doc(db, "users", userId);
  await updateDoc(userRef, { subscriptionId });
};

module.exports = { saveSubscription };

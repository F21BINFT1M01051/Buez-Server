var admin = require("firebase-admin");

var serviceAccount = require("./socially-1720865151833-firebase-adminsdk-sml5n-8c822181f5.json");

admin.initializeApp({
  credential: admin.credential.cert('./socially-1720865151833-firebase-adminsdk-sml5n-8c822181f5.json')
});


const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
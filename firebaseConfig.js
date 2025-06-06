const { getApp, getApps, initializeApp } = require("firebase/app");
const { getFirestore } = require("firebase/firestore");
const { initializeAuth, getReactNativePersistence } = require('firebase/auth');
const AsyncStorage = require('@react-native-async-storage/async-storage');
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBRAw10W0C5r94phUdU1I7Pj1tkufPBg3U",
  authDomain: "socially-1720865151833.firebaseapp.com",
  projectId: "socially-1720865151833",
  storageBucket: "socially-1720865151833.appspot.com",
  messagingSenderId: "291364316025",
  appId: "1:291364316025:web:7098c369e7d2a9bb4285a8",
  measurementId: "G-4VKB8JLENR"
};

// Initialize Firebase
const FIREBASE_APP = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const FIREBASE_AUTH = initializeAuth(FIREBASE_APP, {
  persistence: getReactNativePersistence(AsyncStorage)
});
const FIREBASE_DB = getFirestore(FIREBASE_APP);

module.exports = { FIREBASE_APP, FIREBASE_AUTH, FIREBASE_DB };

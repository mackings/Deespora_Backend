// src/services/firebase.js
import admin from "firebase-admin";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

// Initialize Firebase Admin
const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./serviceAccountKey.json";
if (!fs.existsSync(credsPath)) {
  console.warn(`[firebase] Warning: service account file not found at ${credsPath}. Admin features will fail.`);
} else if (!admin.apps.length) {
  const serviceAccount = JSON.parse(fs.readFileSync(credsPath, "utf-8"));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Send OTP -> backend generates a custom token
export async function createCustomToken(uid) {
  return admin.auth().createCustomToken(uid);
}

// Verify Firebase ID token
export async function verifyIdToken(idToken) {
  return admin.auth().verifyIdToken(idToken);
}

























// import admin from "firebase-admin";
// import axios from "axios";
// import fs from "fs";
// import dotenv from "dotenv";
// dotenv.config();

// // Initialize firebase-admin using GOOGLE_APPLICATION_CREDENTIALS path
// const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./serviceAccountKey.json";
// if (!fs.existsSync(credsPath)) {
//   console.warn(`[firebase] Warning: service account file not found at ${credsPath}. Admin features will fail until provided.`);
// } else if (!admin.apps.length) {
//   const serviceAccount = JSON.parse(fs.readFileSync(credsPath, "utf-8"));
//   admin.initializeApp({
//     credential: admin.credential.cert(serviceAccount),
//   });
// }

// const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY;
// if (!FIREBASE_WEB_API_KEY) {
//   console.warn("[firebase] Missing FIREBASE_WEB_API_KEY. Phone endpoints will fail.");
// }

// export async function sendVerificationCode({ phoneNumber, recaptchaToken }) {
//   const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${FIREBASE_WEB_API_KEY}`;
//   const { data } = await axios.post(url, { phoneNumber, recaptchaToken });
//   return data; // { sessionInfo }
// }

// export async function signInWithPhoneNumber({ code, sessionInfo }) {
//   const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber?key=${FIREBASE_WEB_API_KEY}`;
//   const { data } = await axios.post(url, { code, sessionInfo });
//   return data; // { idToken, refreshToken, phoneNumber, localId, ... }
// }

// export async function verifyIdToken(idToken) {
//   return admin.auth().verifyIdToken(idToken);
// }

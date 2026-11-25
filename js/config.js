// 1. Paste your Firebase web app config here (Firebase console → Project settings →
//    General → Your apps → Web app → "SDK setup and configuration" → Config).
//    These values are not secrets; access is controlled by the security rules.
export const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
};

// 2. The Google account email that owns the dashboard. Must match the email
//    in firestore.rules and storage.rules.
export const OWNER_EMAIL = "PASTE_OWNER_EMAIL@gmail.com";

// How long a code word stays valid.
export const CODE_VALID_DAYS = 10;

// 1. Paste your Firebase web app config here (Firebase console → Project settings →
//    General → Your apps → Web app → "SDK setup and configuration" → Config).
//    These values are not secrets; access is controlled by the security rules.
export const firebaseConfig = {
  apiKey: "AIzaSyDv0n_r1YftVHFS0MuOnEHMvlIZP30vquI",
  authDomain: "house-handover-85bab.firebaseapp.com",
  projectId: "house-handover-85bab",
  storageBucket: "house-handover-85bab.firebasestorage.app",
  messagingSenderId: "857787573277",
  appId: "1:857787573277:web:1cf3b81d8ee7280c7492f4",
};

// 2. The Google account email that owns the dashboard. Must match the email
//    in firestore.rules and storage.rules.
export const OWNER_EMAIL = "PASTE_OWNER_EMAIL@gmail.com";

// How long a code word stays valid.
export const CODE_VALID_DAYS = 10;

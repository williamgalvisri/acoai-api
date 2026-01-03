const admin = require('firebase-admin');

// Initialize Firebase
if (!admin.apps.length) {
  let serviceAccount;
  
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Production / Railway: Use Env Var
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    // Local Development: Use file
    // Note: Ensure this file is in .gitignore
    try {
        serviceAccount = require('../../firebase-service-account.json');
    } catch (e) {
        console.error("Firebase service account file not found and FIREBASE_SERVICE_ACCOUNT env var not set.");
    }
  }

  if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: 'harmonyai-4c3b7.firebasestorage.app'
      });
  }
}

const bucket = admin.storage().bucket();

module.exports = bucket;

import admin from 'firebase-admin';
import logger from '../utils/logger.js';

let firebaseInitialized = false;

/**
 * Initialize Firebase Admin SDK
 */
function initializeFirebase() {
  if (firebaseInitialized) {
    return admin.storage();
  }

  try {
    // Parse the private key from environment variable
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
      storageBucket: `${process.env.FIREBASE_PROJECT_ID}.appspot.com`,
    });

    firebaseInitialized = true;
    logger.info('Firebase Admin SDK initialized successfully');

    return admin.storage();
  } catch (error) {
    logger.error('Failed to initialize Firebase Admin SDK:', error);
    throw error;
  }
}

/**
 * Get Firebase Storage bucket
 * @returns {admin.storage.Bucket}
 */
export function getFirebaseBucket() {
  if (!firebaseInitialized) {
    initializeFirebase();
  }
  return admin.storage().bucket();
}

export default initializeFirebase;

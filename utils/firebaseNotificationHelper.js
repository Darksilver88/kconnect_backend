import crypto from 'crypto';
import { getFirestore } from '../config/firebase.js';
import logger from './logger.js';

/**
 * Generate MD5 hash from text
 * @param {string} text - Text to hash
 * @returns {string} - MD5 hash
 */
function md5Hash(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

/**
 * Query customer name from Firebase by customer_code
 * @param {string} customerCode - Customer code (customer_id)
 * @returns {Promise<string|null>} - Customer name or null if not found
 */
export async function getCustomerNameByCode(customerCode) {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('customer')
      .where('customer_code', '==', customerCode)
      .limit(1)
      .get();

    if (snapshot.empty) {
      logger.warn(`Customer not found in Firebase with customer_code: ${customerCode}`);
      return null;
    }

    const customerDoc = snapshot.docs[0];
    const customerName = customerDoc.data().name;

    if (!customerName) {
      logger.warn(`Customer found but name is empty: ${customerCode}`);
      return null;
    }

    logger.debug(`Customer name found: ${customerName} for customer_code: ${customerCode}`);
    return customerName;

  } catch (error) {
    logger.error(`Error querying customer from Firebase (customer_code: ${customerCode}):`, error);
    return null;
  }
}

/**
 * Insert single notification to Firebase
 * @param {Object} notificationData - Notification data from notification_audit_information
 * @param {string} customerName - Customer name from Firebase
 * @returns {Promise<boolean>} - Success status
 */
export async function insertNotificationToFirebase(notificationData, customerName) {
  try {
    const db = getFirestore();

    // Build Firebase document
    const firebaseDoc = buildFirebaseNotificationDoc(notificationData, customerName);

    // Insert to Firebase
    await db.collection('notification_list').add(firebaseDoc);

    logger.info(`Notification inserted to Firebase: ${notificationData.table_name}/${notificationData.rows_id}`);
    return true;

  } catch (error) {
    logger.error('Error inserting notification to Firebase:', error);
    return false;
  }
}

/**
 * Batch insert notifications to Firebase with retry
 * @param {Array<Object>} notificationsArray - Array of notification data
 * @param {string} customerName - Customer name from Firebase
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @returns {Promise<{success: number, failed: number}>} - Insert results
 */
export async function batchInsertNotificationsToFirebase(notificationsArray, customerName, maxRetries = 3) {
  if (!notificationsArray || notificationsArray.length === 0) {
    logger.debug('No notifications to insert to Firebase');
    return { success: 0, failed: 0 };
  }

  if (!customerName) {
    logger.error('Customer name is required for Firebase batch insert');
    return { success: 0, failed: notificationsArray.length };
  }

  let attempt = 0;
  let success = 0;
  let failed = 0;

  while (attempt < maxRetries) {
    attempt++;
    try {
      const db = getFirestore();

      // Split into batches of 500 (Firestore limit)
      const batchSize = 500;
      const batches = [];

      for (let i = 0; i < notificationsArray.length; i += batchSize) {
        const chunk = notificationsArray.slice(i, i + batchSize);
        batches.push(chunk);
      }

      logger.info(`Inserting ${notificationsArray.length} notifications to Firebase in ${batches.length} batch(es) (attempt ${attempt}/${maxRetries})`);

      // Process each batch
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const chunk = batches[batchIndex];
        const batch = db.batch();

        for (const notificationData of chunk) {
          const firebaseDoc = buildFirebaseNotificationDoc(notificationData, customerName);
          const docRef = db.collection('notification_list').doc();
          batch.set(docRef, firebaseDoc);
        }

        // Commit batch
        await batch.commit();
        success += chunk.length;

        logger.info(`Batch ${batchIndex + 1}/${batches.length} committed: ${chunk.length} notifications`);
      }

      logger.info(`Firebase batch insert successful: ${success} notifications inserted`);
      return { success, failed: 0 };

    } catch (error) {
      logger.error(`Firebase batch insert failed (attempt ${attempt}/${maxRetries}):`, error);

      if (attempt >= maxRetries) {
        failed = notificationsArray.length - success;
        logger.error(`Firebase batch insert failed after ${maxRetries} attempts: ${failed} notifications not inserted`);
        return { success, failed };
      }

      // Wait before retry (exponential backoff)
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      logger.info(`Retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  return { success, failed };
}

/**
 * Build Firebase notification document from notification_audit_information data
 * @param {Object} notificationData - Notification data
 * @param {string} customerName - Customer name
 * @returns {Object} - Firebase document
 */
function buildFirebaseNotificationDoc(notificationData, customerName) {
  const customerNameMD5 = md5Hash(customerName);

  return {
    // From notification_audit_information
    create_date: notificationData.create_date,
    detail: notificationData.detail || '',
    title: notificationData.title || '',
    topic: notificationData.topic || '',
    type: notificationData.type || '',
    userID: notificationData.receiver ? [notificationData.receiver] : [],
    docID: [`${notificationData.table_name}/${notificationData.rows_id}`],

    // From Firebase customer query
    customerName: customerName,
    customerNameMD5: customerNameMD5,
    siteName: customerName,
    siteNameMD5: customerNameMD5,

    // Hardcoded values
    isResident: true,
    is_delete: false,
    is_detail: false,
    nameRouter: 'paymentHomePage',
    no_page: false,
    sendNoti: true,
    servicePath: 'kconnect_config/config/services/VUy8FLk9UuFiGyuiTPdl',
    status: 1
  };
}

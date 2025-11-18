import logger from './logger.js';
import { getCustomerNameByCode, batchInsertNotificationsToFirebase } from './firebaseNotificationHelper.js';

/**
 * Format date to Thai format (e.g., "12 ธันวาคม 2025")
 * @param {Date|string} date - Date to format
 * @returns {string} - Formatted date in Thai
 */
function formatThaiDate(date) {
  if (!date) return '';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  const day = d.getDate();
  const month = thaiMonths[d.getMonth()];
  const year = d.getFullYear() + 543; // Convert to Buddhist Era

  return `${day} ${month} ${year}`;
}

/**
 * Insert notification audit records for multiple rows
 * @param {Object} db - Database connection
 * @param {string} tableName - Target table name (e.g., 'bill_room_information', 'member_information')
 * @param {Array<number>} rowsIds - Array of row IDs to insert notification audit for
 * @param {string} customerId - Customer ID
 * @param {number} userId - User ID who triggered the notification
 * @param {Object} options - Optional fields: { remark, title, detail, topic, type, receiver }
 * @returns {Promise<{insertedCount: number, notificationData: Object}>} - Number of records inserted and notification data for Firebase
 */
export async function insertNotificationAudit(db, tableName, rowsIds, customerId, userId, options = {}) {
  if (!rowsIds || rowsIds.length === 0) {
    logger.debug(`No rows provided for notification audit (table: ${tableName})`);
    return { insertedCount: 0, notificationsForFirebase: [] };
  }

  const { remark = null, title = null, detail = null, topic = null, type = null, receiver = null } = options;

  const insertQuery = `
    INSERT INTO notification_audit_information (
      table_name, rows_id, title, detail, topic, type, receiver, customer_id, remark, create_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  let insertedCount = 0;
  const notificationsForFirebase = [];

  for (const rowId of rowsIds) {
    const [result] = await db.execute(insertQuery, [
      tableName,
      rowId,
      title,
      detail,
      topic,
      type,
      receiver,
      customerId,
      remark,
      userId
    ]);
    insertedCount++;

    // Collect notification data for Firebase batch insert
    // Note: create_date will be NOW() in MySQL, we'll use current timestamp
    notificationsForFirebase.push({
      table_name: tableName,
      rows_id: rowId,
      title,
      detail,
      topic,
      type,
      receiver,
      customer_id: customerId,
      remark,
      create_date: new Date() // Use current timestamp for Firebase
    });
  }

  logger.info(`Notification audit inserted: ${insertedCount} records for ${tableName} (customer_id=${customerId})`);

  // Return both count and notification data for Firebase
  return {
    insertedCount,
    notificationsForFirebase
  };
}

/**
 * Insert notification audit for bill_room_information when bill is sent
 * @param {Object} db - Database connection
 * @param {number} billIdOrBillRoomId - Bill ID or Bill Room ID (depends on options.mode)
 * @param {string} customerId - Customer ID
 * @param {number} userId - User ID
 * @param {string} billTitle - Bill title from bill_information
 * @param {string} billDetail - Bill detail from bill_information
 * @param {Date|string} billExpireDate - Bill expire date from bill_information
 * @param {string|null} remark - Optional remark (for backward compatibility)
 * @param {Object} options - Optional fields: { mode: 'bill' | 'bill_room' }
 * @returns {Promise<number>} - Number of records inserted
 */
export async function insertNotificationAuditForBill(db, billIdOrBillRoomId, customerId, userId, billTitle, billDetail, billExpireDate, remark = null, options = {}) {
  const { mode = 'bill' } = options;

  // Step 1: Query customer name from Firebase
  const customerName = await getCustomerNameByCode(customerId);
  if (!customerName) {
    logger.error(`Cannot insert notification to Firebase: customer not found for customer_id=${customerId}`);
    // Continue with MySQL insert, but skip Firebase
  }

  // Get all bill_room_information
  let billRoomQuery;
  let queryParams;

  if (mode === 'bill_room') {
    // Query single bill_room by ID
    billRoomQuery = `
      SELECT id, customer_id, house_no, member_name
      FROM bill_room_information
      WHERE id = ? AND status != 2
    `;
    queryParams = [billIdOrBillRoomId];
  } else {
    // Query all bill_rooms by bill_id (default)
    billRoomQuery = `
      SELECT id, customer_id, house_no, member_name
      FROM bill_room_information
      WHERE bill_id = ? AND status != 2
    `;
    queryParams = [billIdOrBillRoomId];
  }

  const [billRoomRows] = await db.execute(billRoomQuery, queryParams);

  if (billRoomRows.length === 0) {
    logger.debug(`No bill_room_information found for ${mode === 'bill_room' ? 'bill_room_id' : 'bill_id'}=${billIdOrBillRoomId}`);
    return 0;
  }

  let insertedCount = 0;
  const allNotificationsForFirebase = []; // Collect all notifications for batch insert

  // Notification values from bill_information
  const title = billTitle || "แจ้งเตือนบิล";       // Use bill title or fallback

  // Combine detail with expire_date in Thai format
  let detail = billDetail || "กรุณาชำระบิล";
  if (billExpireDate) {
    const formattedExpireDate = formatThaiDate(billExpireDate);
    if (formattedExpireDate) {
      detail = `${detail} ครบกำหนด: ${formattedExpireDate}`;
    }
  }

  const topic = "billing";
  const type = "billing";

  for (const billRoom of billRoomRows) {
    let receiver = null;

    try {
      // Find matching member to get receiver (user_ref)
      // Match on customer_id and house_no (exact), and member_name contains full_name
      const memberQuery = `
        SELECT user_ref
        FROM member_information
        WHERE customer_id = ?
          AND house_no = ?
          AND ? LIKE CONCAT('%', full_name, '%')
          AND status != 2
        LIMIT 1
      `;

      const [memberRows] = await db.execute(memberQuery, [
        billRoom.customer_id,
        billRoom.house_no,
        billRoom.member_name
      ]);

      if (memberRows.length > 0 && memberRows[0].user_ref) {
        // Extract UID from user_ref (e.g., 'kconnect_users/7mEtLlUK1VfBzPMyEn5EYlH08xR2' -> '7mEtLlUK1VfBzPMyEn5EYlH08xR2')
        const userRefParts = memberRows[0].user_ref.split('/');
        receiver = userRefParts[userRefParts.length - 1];
        logger.debug(`Found receiver ${receiver} for bill_room_id=${billRoom.id}`);
      } else {
        logger.debug(`No matching member found for bill_room_id=${billRoom.id}, house_no=${billRoom.house_no}, member_name=${billRoom.member_name}`);
      }
    } catch (error) {
      logger.error(`Error fetching receiver for bill_room_id=${billRoom.id}:`, error);
    }

    // Insert notification audit with hardcoded values and dynamic receiver
    const fullOptions = {
      remark,
      title,
      detail,
      topic,
      type,
      receiver
    };

    const result = await insertNotificationAudit(db, 'bill_room_information', [billRoom.id], billRoom.customer_id, userId, fullOptions);

    // Handle both old return format (number) and new return format (object)
    if (typeof result === 'object' && result.insertedCount) {
      insertedCount += result.insertedCount;
      if (result.notificationsForFirebase) {
        allNotificationsForFirebase.push(...result.notificationsForFirebase);
      }
    } else if (typeof result === 'number') {
      insertedCount += result;
    }
  }

  logger.info(`Notification audit inserted: ${insertedCount} records for ${mode === 'bill_room' ? 'bill_room_id' : 'bill_id'}=${billIdOrBillRoomId} (customer_id=${customerId})`);

  // Step 2: Batch insert to Firebase (only if we have customer name and notifications)
  if (customerName && allNotificationsForFirebase.length > 0) {
    try {
      const firebaseResult = await batchInsertNotificationsToFirebase(allNotificationsForFirebase, customerName);
      logger.info(`Firebase batch insert completed: ${firebaseResult.success} success, ${firebaseResult.failed} failed`);
    } catch (firebaseError) {
      // Log error but don't fail the MySQL operation
      logger.error('Firebase batch insert failed:', firebaseError);
    }
  } else if (!customerName) {
    logger.warn(`Skipping Firebase insert: customer name not found for customer_id=${customerId}`);
  }

  return insertedCount;
}

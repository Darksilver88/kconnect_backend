import logger from './logger.js';

/**
 * Insert notification audit records for multiple rows
 * @param {Object} db - Database connection
 * @param {string} tableName - Target table name (e.g., 'bill_room_information', 'member_information')
 * @param {Array<number>} rowsIds - Array of row IDs to insert notification audit for
 * @param {string} customerId - Customer ID
 * @param {number} userId - User ID who triggered the notification
 * @param {Object} options - Optional fields: { remark, title, detail, topic, type, receiver }
 * @returns {Promise<number>} - Number of records inserted
 */
export async function insertNotificationAudit(db, tableName, rowsIds, customerId, userId, options = {}) {
  if (!rowsIds || rowsIds.length === 0) {
    logger.debug(`No rows provided for notification audit (table: ${tableName})`);
    return 0;
  }

  const { remark = null, title = null, detail = null, topic = null, type = null, receiver = null } = options;

  const insertQuery = `
    INSERT INTO notification_audit_information (
      table_name, rows_id, title, detail, topic, type, receiver, customer_id, remark, create_by
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  let insertedCount = 0;

  for (const rowId of rowsIds) {
    await db.execute(insertQuery, [
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
  }

  logger.info(`Notification audit inserted: ${insertedCount} records for ${tableName} (customer_id=${customerId})`);
  return insertedCount;
}

/**
 * Insert notification audit for bill_room_information when bill is sent
 * @param {Object} db - Database connection
 * @param {number} billId - Bill ID
 * @param {string} customerId - Customer ID
 * @param {number} userId - User ID
 * @param {string|null} remark - Optional remark (for backward compatibility)
 * @param {Object} options - Optional fields (not used, hardcoded values applied)
 * @returns {Promise<number>} - Number of records inserted
 */
export async function insertNotificationAuditForBill(db, billId, customerId, userId, remark = null, options = {}) {
  // Get all bill_room_information for this bill with member details
  const billRoomQuery = `
    SELECT id, customer_id, house_no, member_name
    FROM bill_room_information
    WHERE bill_id = ? AND status != 2
  `;

  const [billRoomRows] = await db.execute(billRoomQuery, [billId]);

  if (billRoomRows.length === 0) {
    logger.debug(`No bill_room_information found for bill_id=${billId}`);
    return 0;
  }

  let insertedCount = 0;

  // Hardcoded notification values
  const title = "แจ้งเตือนบิล";
  const detail = "กรุณาชำระบิล";
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

    await insertNotificationAudit(db, 'bill_room_information', [billRoom.id], billRoom.customer_id, userId, fullOptions);
    insertedCount++;
  }

  logger.info(`Notification audit inserted: ${insertedCount} records for bill_id=${billId} (customer_id=${customerId})`);
  return insertedCount;
}

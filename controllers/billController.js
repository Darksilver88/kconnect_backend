import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { addFormattedDates, addFormattedDatesToList } from '../utils/dateFormatter.js';
import { formatNumber, formatPrice } from '../utils/numberFormatter.js';
import { getUploadType } from '../utils/storageManager.js';
import { insertNotificationAuditForBill } from '../utils/notificationHelper.js';
import xlsx from 'xlsx';
import ExcelJS from 'exceljs';
import fs from 'fs';
import https from 'https';
import http from 'http';

const MENU = 'bill';
const TABLE_INFORMATION = `${MENU}_information`;
const TABLE_ROOM = `${MENU}_room_information`;
const TABLE_TYPE = `${MENU}_type_information`;
const TABLE_ATTACHMENT = `${MENU}_attachment`;
const TABLE_AUDIT = `${MENU}_audit_information`;

/**
 * Helper function to insert bill audit log
 * @param {Object} db - Database connection
 * @param {number} billId - Bill ID
 * @param {number} status - Status value
 * @param {number} userId - User ID who made the change
 */
async function insertBillAudit(db, billId, status, userId) {
  const insertLogQuery = `
    INSERT INTO ${TABLE_AUDIT} (bill_id, status, create_by)
    VALUES (?, ?, ?)
  `;

  await db.execute(insertLogQuery, [billId, status, userId]);
  logger.debug(`Bill audit log inserted: bill_id=${billId}, status=${status}, user=${userId}`);
}

/**
 * Helper function to read file from Firebase URL or Local path
 * @param {string} filePath - Firebase URL or local file path
 * @param {string} fileExt - File extension (xlsx, xls, csv)
 * @returns {Promise<Object>} xlsx workbook object
 */
async function readExcelFile(filePath, fileExt) {
  const uploadType = getUploadType();

  if (uploadType === 'firebase' || filePath.startsWith('http://') || filePath.startsWith('https://')) {
    // Firebase mode: fetch file from URL
    return new Promise((resolve, reject) => {
      const protocol = filePath.startsWith('https://') ? https : http;

      protocol.get(filePath, (response) => {
        if (response.statusCode !== 200) {
          return reject(new Error(`Failed to fetch file: HTTP ${response.statusCode}`));
        }

        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          try {
            const buffer = Buffer.concat(chunks);

            let workbook;
            if (fileExt === 'csv') {
              const fileContent = buffer.toString('utf8');
              workbook = xlsx.read(fileContent, { type: 'string', codepage: 65001 });
            } else {
              workbook = xlsx.read(buffer, { type: 'buffer' });
            }

            resolve(workbook);
          } catch (error) {
            reject(error);
          }
        });
        response.on('error', reject);
      }).on('error', reject);
    });
  } else {
    // Project mode: read from local file
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found on server');
    }

    if (fileExt === 'csv') {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      return xlsx.read(fileContent, { type: 'string', codepage: 65001 });
    } else {
      return xlsx.readFile(filePath);
    }
  }
}

export const insertBill = async (req, res) => {
  try {
    const { upload_key, title, bill_type_id, detail, expire_date, customer_id, status, remark, uid } = req.body;

    if (!upload_key || !title || !bill_type_id || !detail || !expire_date || !customer_id || status === undefined || !uid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: upload_key, title, bill_type_id, detail, expire_date, customer_id, status, uid',
        required: ['upload_key', 'title', 'bill_type_id', 'detail', 'expire_date', 'customer_id', 'status', 'uid']
      });
    }

    const db = getDatabase();

    // Adjust expire_date time to 23:59:59 (UTC timezone)
    const expireDateObj = new Date(expire_date);
    expireDateObj.setUTCHours(23);
    expireDateObj.setUTCMinutes(59);
    expireDateObj.setUTCSeconds(59);
    expireDateObj.setUTCMilliseconds(0);

    // For send_date: use NOW() if status is 1, otherwise NULL
    const sendDateValue = parseInt(status) === 1 ? 'NOW()' : 'NULL';

    const insertQuery = `
      INSERT INTO ${TABLE_INFORMATION} (upload_key, title, bill_type_id, detail, expire_date, send_date, remark, customer_id, status, create_by)
      VALUES (?, ?, ?, ?, ?, ${sendDateValue}, ?, ?, ?, ?)
    `;

    const billTypeIdValue = parseInt(bill_type_id);

    const [result] = await db.execute(insertQuery, [
      upload_key?.trim(),
      title?.trim(),
      billTypeIdValue,
      detail?.trim(),
      expireDateObj,
      // sendDate removed - using NOW() or NULL directly in query
      remark?.trim() || null,
      customer_id?.trim(),
      status,
      uid
    ]);

    // Insert bill audit log
    await insertBillAudit(db, result.insertId, parseInt(status), uid);

    res.json({
      success: true,
      message: 'Bill inserted successfully',
      data: {
        id: result.insertId,
        upload_key,
        title,
        bill_type_id: billTypeIdValue,
        detail,
        expire_date,
        send_date: parseInt(status) === 1 ? new Date().toISOString() : null,
        remark,
        customer_id,
        status,
        create_by: uid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Insert bill error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to insert bill',
      message: error.message
    });
  }
};

export const updateBill = async (req, res) => {
  try {
    const { id, title, bill_type_id, detail, expire_date, status, remark, uid, delete_rows } = req.body;

    if (!id || !title || !bill_type_id || !detail || !expire_date || status === undefined || !uid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: id, title, bill_type_id, detail, expire_date, status, uid',
        required: ['id', 'title', 'bill_type_id', 'detail', 'expire_date', 'status', 'uid']
      });
    }

    const db = getDatabase();

    // Parse delete_rows (optional, default = [])
    // รองรับทั้ง JSON array และ string
    let deleteRowsArray = [];

    if (Array.isArray(delete_rows)) {
      // กรณีส่งมาเป็น JSON array: [1, 2, 3]
      deleteRowsArray = delete_rows.map(num => parseInt(num));
    } else if (typeof delete_rows === 'string' && delete_rows.trim() !== '') {
      // กรณีส่งมาเป็น string: "[1,2,3]" หรือ "1,2,3"
      try {
        const parsed = JSON.parse(delete_rows);
        if (Array.isArray(parsed)) {
          deleteRowsArray = parsed.map(num => parseInt(num));
        }
      } catch {
        // ถ้า parse ไม่ได้ ลองแยกด้วย comma
        deleteRowsArray = delete_rows.split(',')
          .map(str => parseInt(str.trim()))
          .filter(num => !isNaN(num));
      }
    }

    // Check current status to determine if we need to set send_date
    const checkQuery = `SELECT status, send_date, customer_id FROM ${TABLE_INFORMATION} WHERE id = ? AND status != 2`;
    const [currentRows] = await db.execute(checkQuery, [id]);

    if (currentRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bill not found',
        message: 'ไม่พบข้อมูลบิล'
      });
    }

    const currentStatus = currentRows[0].status;
    const currentSendDate = currentRows[0].send_date;
    const billCustomerId = currentRows[0].customer_id;

    // Start transaction
    await db.query('START TRANSACTION');

    try {
      // Step 1: Soft delete bill_room_information rows if delete_rows is provided
      let deletedCount = 0;
      if (deleteRowsArray.length > 0) {
        // Get all bill_room_information for this bill
        const billRoomQuery = `
          SELECT id
          FROM ${TABLE_ROOM}
          WHERE bill_id = ? AND status != 2
          ORDER BY create_date ASC
        `;
        const [billRoomRows] = await db.execute(billRoomQuery, [id]);

        // Map row_number to actual IDs
        const idsToDelete = [];
        deleteRowsArray.forEach(rowNum => {
          const index = rowNum - 1; // row_number starts from 1, array index starts from 0
          if (index >= 0 && index < billRoomRows.length) {
            idsToDelete.push(billRoomRows[index].id);
          }
        });

        // Validate: cannot delete all bill_room_information
        if (idsToDelete.length > 0) {
          const remainingCount = billRoomRows.length - idsToDelete.length;

          if (remainingCount === 0) {
            await db.query('ROLLBACK');
            return res.status(400).json({
              success: false,
              error: 'Cannot delete all bill room items',
              message: 'ไม่สามารถลบรายการทั้งหมดได้',
              details: {
                total_items: billRoomRows.length,
                items_to_delete: idsToDelete.length,
                remaining_items: remainingCount
              }
            });
          }

          // Soft delete selected rows
          const placeholders = idsToDelete.map(() => '?').join(',');
          const deleteQuery = `
            UPDATE ${TABLE_ROOM}
            SET status = 2, delete_date = NOW(), delete_by = ?
            WHERE id IN (${placeholders}) AND bill_id = ?
          `;
          const [deleteResult] = await db.execute(deleteQuery, [uid, ...idsToDelete, id]);
          deletedCount = deleteResult.affectedRows;
        }
      }

      // Step 2: Update bill_information
      // Set send_date to current date if status is changing to 1 and send_date is null
      let sendDateUpdate = '';
      let queryParams = [];

      if (parseInt(status) === 1 && currentSendDate === null) {
        sendDateUpdate = ', send_date = NOW()';
      }

      // Adjust expire_date time to 23:59:59 (UTC timezone)
      const expireDateObj = new Date(expire_date);
      expireDateObj.setUTCHours(23);
      expireDateObj.setUTCMinutes(59);
      expireDateObj.setUTCSeconds(59);
      expireDateObj.setUTCMilliseconds(0);

      const updateQuery = `
        UPDATE ${TABLE_INFORMATION}
        SET title = ?, bill_type_id = ?, detail = ?, expire_date = ?, remark = ?, status = ?${sendDateUpdate}, update_date = NOW(), update_by = ?
        WHERE id = ? AND status != 2
      `;

      queryParams = [
        title?.trim(),
        parseInt(bill_type_id),
        detail?.trim(),
        expireDateObj,
        remark?.trim() || null,
        status,
        uid,
        id
      ];

      const [result] = await db.execute(updateQuery, queryParams);

      // Step 3: Insert bill audit log if status changed
      if (currentStatus !== parseInt(status)) {
        await insertBillAudit(db, parseInt(id), parseInt(status), uid);
      }

      // Commit transaction
      await db.query('COMMIT');

      // Step 4: Insert notification audit if status changed from other value to 1 (sent)
      // ถ้าเปลี่ยนจาก status อื่น มาเป็น 1 (เช่น 0 -> 1 หรือ 3 -> 1)
      // แต่ไม่รวม 1 -> 1 (user แค่แก้ข้อมูลอื่น)
      if (currentStatus !== 1 && parseInt(status) === 1) {
        try {
          await insertNotificationAuditForBill(db, parseInt(id), billCustomerId, uid, 'ส่งบิล');
          logger.info(`Bill ${id} status changed to sent (${currentStatus} -> 1), notification audit created`);
        } catch (notifError) {
          // Log error but don't fail the update
          logger.error('Failed to insert notification audit:', notifError);
        }
      }

      res.json({
        success: true,
        message: 'Bill updated successfully',
        data: {
          id: parseInt(id),
          title,
          bill_type_id: parseInt(bill_type_id),
          detail,
          expire_date,
          remark,
          status,
          send_date_updated: parseInt(status) === 1 && currentSendDate === null,
          deleted_rows_count: deletedCount,
          update_by: uid
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      // Rollback on error
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    logger.error('Update bill error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update bill',
      message: error.message
    });
  }
};

export const sendBill = async (req, res) => {
  try {
    const { id, uid } = req.body;

    if (!id || !uid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: id, uid',
        required: ['id', 'uid']
      });
    }

    const db = getDatabase();

    // Check if bill exists and get current status and customer_id
    const checkQuery = `SELECT status, customer_id FROM ${TABLE_INFORMATION} WHERE id = ? AND status != 2`;
    const [currentRows] = await db.execute(checkQuery, [id]);

    if (currentRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bill not found',
        message: 'ไม่พบข้อมูลบิล'
      });
    }

    const currentStatus = currentRows[0].status;
    const billCustomerId = currentRows[0].customer_id;

    // Update status from 0 or 3 to 1 and set send_date
    const updateQuery = `
      UPDATE ${TABLE_INFORMATION}
      SET status = 1, send_date = NOW(), update_date = NOW(), update_by = ?
      WHERE id = ? AND status IN (0, 3)
    `;

    const [result] = await db.execute(updateQuery, [uid, id]);

    if (result.affectedRows === 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot send bill',
        message: currentStatus === 1
          ? 'บิลนี้ถูกส่งไปแล้ว'
          : 'บิลนี้ไม่สามารถส่งได้ ต้องมี status = 0 หรือ 3 เท่านั้น'
      });
    }

    // Insert bill audit log
    await insertBillAudit(db, parseInt(id), 1, uid);

    // Insert notification audit for all bill_rooms
    // เมื่อส่งบิล (status → 1) ต้องบันทึกการแจ้งเตือน
    try {
      await insertNotificationAuditForBill(db, parseInt(id), billCustomerId, uid, 'ส่งบิล');
      logger.info(`Bill ${id} sent, notification audit created`);
    } catch (notifError) {
      // Log error but don't fail the send operation
      logger.error('Failed to insert notification audit:', notifError);
    }

    logger.info(`User ${uid} sent bill ID: ${id}`);

    res.json({
      success: true,
      message: 'Bill sent successfully',
      data: {
        id: parseInt(id),
        status: 1,
        send_date_updated: true,
        update_by: uid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Send bill error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send bill',
      message: error.message
    });
  }
};

export const cancelSendBill = async (req, res) => {
  try {
    const { id, uid } = req.body;

    if (!id || !uid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: id, uid',
        required: ['id', 'uid']
      });
    }

    const db = getDatabase();

    // Check if bill exists and status is 1
    const checkQuery = `SELECT status FROM ${TABLE_INFORMATION} WHERE id = ? AND status != 2`;
    const [currentRows] = await db.execute(checkQuery, [id]);

    if (currentRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bill not found',
        message: 'ไม่พบข้อมูลบิล'
      });
    }

    const currentStatus = currentRows[0].status;

    // Update status from 1 to 3 and remove send_date
    const updateQuery = `
      UPDATE ${TABLE_INFORMATION}
      SET status = 3, send_date = NULL, update_date = NOW(), update_by = ?
      WHERE id = ? AND status = 1
    `;

    const [result] = await db.execute(updateQuery, [uid, id]);

    if (result.affectedRows === 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel send bill',
        message: currentStatus === 0
          ? 'บิลนี้ยังไม่ได้ถูกส่ง'
          : 'บิลนี้ไม่สามารถยกเลิกการส่งได้ ต้องมี status = 1 เท่านั้น'
      });
    }

    // Insert bill audit log
    await insertBillAudit(db, parseInt(id), 3, uid);

    logger.info(`User ${uid} canceled send bill ID: ${id}`);

    res.json({
      success: true,
      message: 'Bill send canceled successfully',
      data: {
        id: parseInt(id),
        status: 3,
        send_date_removed: true,
        update_by: uid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Cancel send bill error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel send bill',
      message: error.message
    });
  }
};

export const deleteBill = async (req, res) => {
  try {
    const { id, uid } = req.body;

    if (!id || !uid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: id, uid',
        required: ['id', 'uid']
      });
    }

    const db = getDatabase();

    const deleteQuery = `
      UPDATE ${TABLE_INFORMATION}
      SET status = 2, delete_date = NOW(), delete_by = ?
      WHERE id = ? AND status != 2
    `;

    const [result] = await db.execute(deleteQuery, [uid, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bill not found',
        message: 'ไม่พบข้อมูลบิล'
      });
    }

    // Insert bill audit log
    await insertBillAudit(db, parseInt(id), 2, uid);

    logger.info(`User ${uid} deleted bill ID: ${id}`);

    res.json({
      success: true,
      message: 'Bill deleted successfully',
      data: {
        id: parseInt(id),
        delete_by: uid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Delete bill error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete bill',
      message: error.message
    });
  }
};

export const getBillDetail = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter',
        message: 'กรุณาระบุ id',
        required: ['id']
      });
    }

    const db = getDatabase();

    // Query bill information with attachment
    const billQuery = `
      SELECT b.id, b.upload_key, b.bill_no, b.title, b.bill_type_id, b.detail, b.expire_date, b.send_date, b.remark, b.customer_id, b.status,
             b.create_date, b.create_by, b.update_date, b.update_by, b.delete_date, b.delete_by,
             bt.title as bill_type_title,
             ba.id as attachment_id,
             ba.file_name,
             ba.file_path,
             ba.file_ext,
             ba.file_size
      FROM ${TABLE_INFORMATION} b
      LEFT JOIN ${TABLE_TYPE} bt ON b.bill_type_id = bt.id
      LEFT JOIN (
        SELECT id, upload_key, file_name, file_path, file_ext, file_size
        FROM ${TABLE_ATTACHMENT}
        WHERE status = 1
        ORDER BY create_date DESC
        LIMIT 1
      ) ba ON b.upload_key = ba.upload_key
      WHERE b.id = ? AND b.status != 2
    `;

    const [billRows] = await db.execute(billQuery, [id]);

    if (billRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bill not found',
        message: 'ไม่พบข้อมูลบิล'
      });
    }

    const billData = billRows[0];

    // Query bill_room_information
    const billRoomQuery = `
      SELECT id, bill_id, bill_no, house_no, member_name, total_price, remark, status, create_date, create_by
      FROM ${TABLE_ROOM}
      WHERE bill_id = ? AND status != 2
      ORDER BY create_date ASC
    `;

    const [billRoomRows] = await db.execute(billRoomQuery, [id]);

    // Count and sum
    const totalRoom = billRoomRows.length;
    const totalPrice = billRoomRows.reduce((sum, row) => sum + parseFloat(row.total_price || 0), 0);

    // Calculate summary counts
    let validCount = 0;
    let invalidCount = 0;

    // Format bill_room items (แบบเดียวกับ getBillExcelList)
    const items = billRoomRows.map((row, index) => {
      const item = {
        row_number: index + 1,
        house_no: row.house_no || 'ไม่ระบุ',
        member_name: row.member_name || 'ไม่ระบุ',
        total_price: row.total_price ? row.total_price.toString() : 'ไม่ระบุ',
        remark: row.remark || '-',
        status: 1 // ถูกต้องทั้งหมด (เพราะข้อมูลอยู่ใน DB แล้ว)
      };

      // Check if valid (ถ้ามีข้อมูลครบ)
      if (row.house_no && row.member_name && row.total_price) {
        validCount++;
      } else {
        invalidCount++;
        item.status = 0;
        item.error_message = 'ขาดข้อมูลจำเป็น';
      }

      return item;
    });

    // Add formatted dates (including expire_date and send_date)
    const formattedBillData = addFormattedDates(billData, ['create_date', 'update_date', 'delete_date', 'expire_date', 'send_date']);

    // Add additional fields
    formattedBillData.total_room = totalRoom;
    formattedBillData.total_price = formatPrice(totalPrice);

    // Add bill_room data (แบบเดียวกับ getBillExcelList)
    formattedBillData.bill_room_data = {
      total_rows: formatNumber(totalRoom),
      valid_rows: formatNumber(validCount),
      invalid_rows: formatNumber(invalidCount),
      total_price: formatPrice(totalPrice),
      items: items
    };

    res.json({
      success: true,
      data: formattedBillData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get bill detail error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bill',
      message: error.message
    });
  }
};

export const insertBillWithExcel = async (req, res) => {
  try {
    const { upload_key, title, bill_type_id, detail, expire_date, customer_id, status, uid, excluded_rows } = req.body;

    // Validate required fields
    if (!upload_key || !title || !bill_type_id || !detail || !expire_date || !customer_id || status === undefined || !uid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: upload_key, title, bill_type_id, detail, expire_date, customer_id, status, uid',
        required: ['upload_key', 'title', 'bill_type_id', 'detail', 'expire_date', 'customer_id', 'status', 'uid']
      });
    }

    // Parse excluded_rows (optional, default = [])
    // รองรับทั้ง JSON array และ form-data string
    let excludedRowsArray = [];

    if (Array.isArray(excluded_rows)) {
      // กรณีส่งมาเป็น JSON array: [2, 4]
      excludedRowsArray = excluded_rows.map(num => parseInt(num));
    } else if (typeof excluded_rows === 'string' && excluded_rows.trim() !== '') {
      // กรณีส่งมาเป็น form-data string: "[2,4]" หรือ "2,4"
      try {
        const parsed = JSON.parse(excluded_rows);
        if (Array.isArray(parsed)) {
          excludedRowsArray = parsed.map(num => parseInt(num));
        }
      } catch {
        // ถ้า parse ไม่ได้ ลองแยกด้วย comma
        excludedRowsArray = excluded_rows.split(',')
          .map(str => parseInt(str.trim()))
          .filter(num => !isNaN(num));
      }
    }

    const db = getDatabase();

    // Step 1: Query Excel file from bill_attachment
    const attachmentQuery = `
      SELECT file_path, file_name, file_ext
      FROM ${TABLE_ATTACHMENT}
      WHERE upload_key = ? AND status != 2
      ORDER BY create_date DESC
      LIMIT 1
    `;

    const [attachments] = await db.execute(attachmentQuery, [upload_key?.trim()]);

    if (attachments.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Excel file not found',
        message: 'กรุณานำเข้าข้อมูลรายการบิล'
      });
    }

    const attachment = attachments[0];
    const filePath = attachment.file_path;
    const fileExt = attachment.file_ext.toLowerCase();


    // Step 2: Validate file extension
    if (fileExt !== 'xlsx' && fileExt !== 'xls' && fileExt !== 'csv') {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type',
        message: 'ไฟล์ต้องเป็น Excel (.xlsx, .xls) หรือ CSV (.csv) เท่านั้น'
      });
    }

    // Step 3: Read and parse Excel/CSV file
    let workbook;
    try {
      logger.debug('Attempting to read file:', filePath);
      workbook = await readExcelFile(filePath, fileExt);
      logger.debug('Workbook read successfully');
    } catch (error) {
      logger.error('Error reading file:', error);
      return res.status(400).json({
        success: false,
        error: 'Failed to read file',
        message: 'ไม่สามารถอ่านไฟล์ได้ ไฟล์อาจเสียหาย หรือไม่พบไฟล์บนเซิร์ฟเวอร์',
        debug: {
          filePath,
          errorMessage: error.message
        }
      });
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // ตรวจสอบว่าไฟล์เป็น HTML-based Excel หรือไม่ (ข้ามการเช็คสำหรับ CSV)
    if (fileExt !== 'csv' && !worksheet['A1'] && !worksheet['B1'] && !worksheet['C1']) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Excel file format',
        message: 'ไฟล์ Excel ไม่ถูกต้อง กรุณาใช้ไฟล์ .xlsx หรือ .xls ที่สร้างจาก Microsoft Excel โดยตรง (ไม่ใช่ไฟล์ที่แปลงมาจาก HTML)',
        hint: 'ลองเปิดไฟล์ด้วย Microsoft Excel แล้ว Save As เป็น .xlsx ใหม่'
      });
    }

    // อ่าน Excel/CSV แบบ header: 1 (ใช้ row 1 เป็น header)
    const data = xlsx.utils.sheet_to_json(worksheet, {
      defval: null,
      blankrows: false,
      raw: false  // แปลง value เป็น string เพื่อให้ใช้งานง่าย
    });

    // Step 5: Validate file data
    if (!data || data.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'File is empty',
        message: 'ไฟล์ไม่มีข้อมูล'
      });
    }


    // Validate column headers
    const requiredColumns = ['เลขห้อง', 'ชื่อลูกบ้าน', 'ยอดเงิน'];
    const firstRow = data[0];
    const actualColumns = Object.keys(firstRow);
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));

    if (missingColumns.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required columns',
        message: `ไฟล์ต้องมี columns: ${missingColumns.join(', ')}`,
        missing_columns: missingColumns,
        actual_columns: actualColumns,
        debug_info: `คาดหวัง: [${requiredColumns.join(', ')}], พบ: [${actualColumns.join(', ')}]`
      });
    }

    // Validate each row
    const validatedRows = [];
    const skippedRows = [];
    const excludedRowsList = []; // เก็บ row ที่ user เลือกลบออก

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 1; // ลำดับที่ตรงกับ preview (เริ่มจาก 1)

      // ข้ามแถวที่ user เลือกลบออก (excluded_rows)
      if (excludedRowsArray.includes(rowNum)) {
        excludedRowsList.push({
          row: rowNum,
          reason: 'ถูกลบออกโดย user'
        });
        continue;
      }

      // แปลงเลขห้อง: ถ้าเป็น date string ที่มีรูปแบบ "11/1/01" หรือ "1/11/01" ให้แปลงเป็น "11/01"
      let houseNoRaw = row['เลขห้อง'];
      if (houseNoRaw && typeof houseNoRaw === 'string') {
        // ตรวจสอบว่าเป็น date format 3 ส่วน (เช่น "11/1/01" หรือ "1/11/01")
        const datePattern = /^(\d{1,2})\/(\d{1,2})\/(\d{1,2})$/;
        const match = houseNoRaw.match(datePattern);
        if (match) {
          // เลือกเอา 2 ส่วนแรก มาเป็นเลขห้อง (ส่วนที่ 1 และ 2)
          const part1 = match[1].padStart(2, '0');
          const part2 = match[2].padStart(2, '0');
          houseNoRaw = `${part1}/${part2}`;
        }
      }

      const houseNo = houseNoRaw?.toString().trim();
      const memberName = row['ชื่อลูกบ้าน']?.toString().trim();
      const totalPriceRaw = row['ยอดเงิน'];
      const remarkRaw = row['หมายเหตุ'];

      // ข้ามแถวที่ไม่มีข้อมูลครบ 3 ฟิลด์หลัก
      if (!houseNo || !memberName || !totalPriceRaw) {
        skippedRows.push({
          row: rowNum,
          reason: 'ขาดข้อมูลจำเป็น (เลขห้อง, ชื่อลูกบ้าน, หรือยอดเงิน)'
        });
        continue;
      }

      const totalPrice = parseFloat(totalPriceRaw);

      // ตรวจสอบว่ายอดเงินเป็นตัวเลขหรือไม่
      if (isNaN(totalPrice)) {
        skippedRows.push({
          row: rowNum,
          reason: 'ยอดเงินไม่ใช่ตัวเลข'
        });
        continue;
      }

      // remark: ถ้ามีค่าแล้วเป็น string ว่างหรือ null ให้เป็น null
      let remark = null;
      if (remarkRaw && remarkRaw.toString().trim() !== '') {
        remark = remarkRaw.toString().trim();
      }

      validatedRows.push({
        house_no: houseNo,
        member_name: memberName,
        total_price: totalPrice,
        remark: remark
      });
    }

    if (validatedRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid data',
        message: 'ไม่มีข้อมูลที่ถูกต้องในไฟล์',
        skipped_rows: skippedRows,
        total_skipped: skippedRows.length
      });
    }


    // Step 6: Start Transaction
    await db.query('START TRANSACTION');

    try {
      // Step 7: Generate bill_no for bill_information
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const datePrefix = `${month}${day}`;
      const billPattern = `BILL-${year}-${datePrefix}-%`;

      // Query last bill_no with row locking
      const lastBillQuery = `
        SELECT bill_no
        FROM ${TABLE_INFORMATION}
        WHERE bill_no LIKE ? AND customer_id = ?
        ORDER BY bill_no DESC
        LIMIT 1
        FOR UPDATE
      `;

      const [lastBillRows] = await db.query(lastBillQuery, [billPattern, customer_id?.trim()]);

      let billRunNumber = 0;

      if (lastBillRows.length > 0) {
        const lastBillNo = lastBillRows[0].bill_no;
        const parts = lastBillNo.split('-');
        if (parts.length === 4) {
          const lastRunNumber = parseInt(parts[3]);
          billRunNumber = (lastRunNumber + 1) % 1000;
        }
      }

      const generatedBillNo = `BILL-${year}-${datePrefix}-${String(billRunNumber).padStart(3, '0')}`;

      // Step 8: Insert bill_information
      // Adjust expire_date time to 23:59:59 (UTC timezone)
      const expireDateObj = new Date(expire_date);
      expireDateObj.setUTCHours(23);
      expireDateObj.setUTCMinutes(59);
      expireDateObj.setUTCSeconds(59);
      expireDateObj.setUTCMilliseconds(0);

      // For send_date: use NOW() if status is 1, otherwise NULL
      const sendDateValue = parseInt(status) === 1 ? 'NOW()' : 'NULL';

      const billInsertQuery = `
        INSERT INTO ${TABLE_INFORMATION} (upload_key, bill_no, title, bill_type_id, detail, expire_date, send_date, customer_id, status, create_by)
        VALUES (?, ?, ?, ?, ?, ?, ${sendDateValue}, ?, ?, ?)
      `;

      const billTypeIdValue = parseInt(bill_type_id);

      const [billResult] = await db.execute(billInsertQuery, [
        upload_key?.trim(),
        generatedBillNo,
        title?.trim(),
        billTypeIdValue,
        detail?.trim(),
        expireDateObj,
        // sendDate removed - using NOW() or NULL directly in query
        customer_id?.trim(),
        status,
        uid
      ]);

      const billId = billResult.insertId;

      // Insert bill audit log
      await insertBillAudit(db, billId, parseInt(status), uid);

      // Step 9: Generate initial bill_no for bill_room_information with row locking
      const pattern = `INV-${year}-${datePrefix}-%`;

      // ใช้ FOR UPDATE เพื่อ lock row ป้องกัน race condition
      const lastBillNoQuery = `
        SELECT bill_no
        FROM ${TABLE_ROOM}
        WHERE bill_no LIKE ? AND customer_id = ?
        ORDER BY bill_no DESC
        LIMIT 1
        FOR UPDATE
      `;

      const [lastRows] = await db.query(lastBillNoQuery, [pattern, customer_id?.trim()]);

      let runNumber = 0;

      if (lastRows.length > 0) {
        const lastBillNo = lastRows[0].bill_no;
        const parts = lastBillNo.split('-');
        if (parts.length === 4) {
          const lastRunNumber = parseInt(parts[3]);
          runNumber = (lastRunNumber + 1) % 1000;
        }
      }

      // Step 10: Batch INSERT bill_room_information
      const billRoomValues = [];
      const billRoomParams = [];

      for (let i = 0; i < validatedRows.length; i++) {
        const rowData = validatedRows[i];
        const currentRunNumber = (runNumber + i) % 1000;
        const billNo = `INV-${year}-${datePrefix}-${String(currentRunNumber).padStart(3, '0')}`;

        billRoomValues.push('(?, ?, ?, ?, ?, ?, ?, ?, ?)');
        billRoomParams.push(
          billId,
          billNo,
          rowData.house_no,
          rowData.member_name,
          rowData.total_price,
          rowData.remark,
          customer_id?.trim(),
          0, // status = 0 (pending payment)
          uid  // create_by = uid
        );
      }

      const billRoomInsertQuery = `
        INSERT INTO ${TABLE_ROOM} (bill_id, bill_no, house_no, member_name, total_price, remark, customer_id, status, create_by)
        VALUES ${billRoomValues.join(', ')}
      `;

      // ใช้ query() แทน execute() เพราะ dynamic values
      await db.query(billRoomInsertQuery, billRoomParams);

      // Step 11: Commit Transaction
      await db.query('COMMIT');

      // Step 12: Insert notification audit if status = 1 (sent)
      // ถ้าสร้างบิลพร้อมส่ง (status = 1) ให้บันทึกการแจ้งเตือน
      if (parseInt(status) === 1) {
        try {
          await insertNotificationAuditForBill(db, billId, customer_id?.trim(), uid, 'สร้างและส่งบิล');
          logger.info(`Bill ${billId} created with sent status, notification audit created for ${validatedRows.length} rooms`);
        } catch (notifError) {
          // Log error but don't fail the insert
          logger.error('Failed to insert notification audit:', notifError);
        }
      }

      res.json({
        success: true,
        message: 'Bill and bill rooms inserted successfully',
        data: {
          bill_id: billId,
          bill_no: generatedBillNo,
          total_rooms_inserted: validatedRows.length,
          total_rows_excluded: excludedRowsList.length,
          total_rows_skipped: skippedRows.length,
          excluded_rows: excludedRowsList.length > 0 ? excludedRowsList : undefined,
          skipped_rows: skippedRows.length > 0 ? skippedRows : undefined,
          upload_key,
          title,
          customer_id
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      // Rollback on error
      await db.query('ROLLBACK');
      throw error;
    }

  } catch (error) {
    logger.error('Insert bill with Excel error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to insert bill with Excel',
      message: error.message
    });
  }
};

export const getBillList = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, keyword, bill_type_id, customer_id } = req.query;

    if (!customer_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter',
        message: 'กรุณาระบุ customer_id',
        required: ['customer_id']
      });
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    const db = getDatabase();

    let whereClause = 'WHERE b.status != 2';
    let queryParams = [];

    // Status filter
    if (status !== undefined) {
      whereClause += ' AND b.status = ?';
      queryParams.push(parseInt(status));
    }

    // Keyword search (title, detail, dates)
    if (keyword && keyword.trim() !== '') {
      whereClause += ` AND (
        b.title LIKE ?
        OR b.detail LIKE ?
        OR DATE_FORMAT(b.expire_date, '%d/%m/%Y') LIKE ?
        OR DATE_FORMAT(b.send_date, '%d/%m/%Y') LIKE ?
        OR DATE_FORMAT(b.create_date, '%d/%m/%Y') LIKE ?
      )`;
      const searchTerm = `%${keyword.trim()}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Bill type filter
    if (bill_type_id !== undefined && bill_type_id !== '' && parseInt(bill_type_id) !== 0) {
      whereClause += ' AND b.bill_type_id = ?';
      queryParams.push(parseInt(bill_type_id));
    }

    // Customer filter (required)
    whereClause += ' AND b.customer_id = ?';
    queryParams.push(customer_id);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_INFORMATION} b
      ${whereClause}
    `;
    const [countResult] = await db.execute(countQuery, queryParams);
    const total = countResult[0].total;

    const dataQuery = `
      SELECT b.id, b.upload_key, b.bill_no, b.title, b.bill_type_id, b.detail, b.expire_date, b.send_date, b.remark, b.customer_id, b.status,
             b.create_date, b.create_by, b.update_date, b.update_by, b.delete_date, b.delete_by,
             bt.title as bill_type_title,
             COUNT(br.id) as total_room,
             COALESCE(SUM(br.total_price), 0) as total_price
      FROM ${TABLE_INFORMATION} b
      LEFT JOIN ${TABLE_TYPE} bt ON b.bill_type_id = bt.id
      LEFT JOIN ${TABLE_ROOM} br ON br.bill_id = b.id AND br.status != 2
      ${whereClause}
      GROUP BY b.id
      ORDER BY b.create_date DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    const [rows] = await db.execute(dataQuery, queryParams);

    // Add formatted dates (including expire_date and send_date)
    const formattedRows = addFormattedDatesToList(rows, ['create_date', 'update_date', 'delete_date', 'expire_date', 'send_date']);

    // Format total_price with comma, smart decimal, and ฿ prefix
    formattedRows.forEach(row => {
      if (row.total_price !== undefined && row.total_price !== null) {
        row.total_price = formatPrice(parseFloat(row.total_price));
      }
    });

    res.json({
      success: true,
      data: formattedRows,
      pagination: {
        current_page: pageNum,
        per_page: limitNum,
        total: total,
        total_pages: Math.ceil(total / limitNum),
        has_next: pageNum * limitNum < total,
        has_prev: pageNum > 1
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('List bill error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bills',
      message: error.message
    });
  }
};

export const getBillRoomList = async (req, res) => {
  try {
    const { page = 1, limit = 10, keyword, bill_id, status, type } = req.query;

    if (!bill_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter',
        message: 'กรุณาระบุ bill_id',
        required: ['bill_id']
      });
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    const db = getDatabase();

    // Get bill information (including expire_date and detail)
    const billQuery = `
      SELECT b.title, b.detail, b.create_date, b.send_date, b.expire_date, b.status, b.bill_type_id,
             bt.title as bill_type_title
      FROM ${TABLE_INFORMATION} b
      LEFT JOIN ${TABLE_TYPE} bt ON b.bill_type_id = bt.id
      WHERE b.id = ? AND b.status != 2
    `;
    const [billRows] = await db.execute(billQuery, [parseInt(bill_id)]);

    if (billRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bill not found',
        message: 'ไม่พบข้อมูลบิล'
      });
    }

    const billInfo = billRows[0];
    const expireDate = new Date(billInfo.expire_date);
    const currentDate = new Date();
    const isOverdue = currentDate > expireDate;

    // Build WHERE clause for bill_room_information
    let whereClause = 'WHERE bill_id = ? AND status != 2';
    let queryParams = [parseInt(bill_id)];

    // Status filter
    // status = -1 or undefined or '': แสดงทั้งหมด
    // status = 0: ยังไม่ชำระ (ยังไม่เลยกำหนด)
    // status = 1: ชำระแล้ว
    // status = 3: เลยกำหนดชำระ (จริงๆ ใน DB เป็น 0 แต่เลย expire_date แล้ว)
    // status = 4: ชำระบางส่วน (partial payment)
    if (status !== undefined && status !== '' && parseInt(status) !== -1) {
      const statusNum = parseInt(status);

      if (statusNum === 0) {
        // แสดงเฉพาะ status = 0 ที่ยังไม่เลยกำหนด
        whereClause += ' AND status = 0';
        if (isOverdue) {
          // ถ้าเลยกำหนดแล้ว ไม่มีรายการ status = 0 ที่ยังไม่เลยกำหนด
          // ใส่เงื่อนไขที่จะไม่มีข้อมูลเลย
          whereClause += ' AND 1 = 0';
        }
      } else if (statusNum === 1) {
        // แสดงเฉพาะ status = 1 (ชำระแล้ว)
        whereClause += ' AND status = 1';
      } else if (statusNum === 3) {
        // แสดงเฉพาะ status = 0 ที่เลยกำหนดแล้ว
        whereClause += ' AND status = 0';
        if (!isOverdue) {
          // ถ้ายังไม่เลยกำหนด ไม่มีรายการ status = 3
          whereClause += ' AND 1 = 0';
        }
      } else if (statusNum === 4) {
        // แสดงเฉพาะ status = 4 (ชำระบางส่วน)
        whereClause += ' AND status = 4';
      }
    }

    // Keyword search (house_no and member_name only)
    if (keyword && keyword.trim() !== '') {
      whereClause += ` AND (
        house_no LIKE ?
        OR member_name LIKE ?
      )`;
      const searchTerm = `%${keyword.trim()}%`;
      queryParams.push(searchTerm, searchTerm);
    }

    // Count total and sum price
    const countQuery = `
      SELECT COUNT(*) as total, COALESCE(SUM(total_price), 0) as total_price_sum
      FROM ${TABLE_ROOM}
      ${whereClause}
    `;
    const [countResult] = await db.execute(countQuery, queryParams);
    const totalCount = countResult[0].total;
    const totalPriceSum = countResult[0].total_price_sum;

    // Get summary data by status (without keyword and status filters - show all)
    const summaryQuery = `
      SELECT
        COUNT(CASE WHEN br.status = 1 THEN 1 END) as status_1,
        COUNT(CASE WHEN br.status = 0 THEN 1 END) as status_0,
        COUNT(CASE WHEN br.status = 4 THEN 1 END) as status_4,
        COALESCE(SUM(bt.transaction_amount), 0) as paid
      FROM ${TABLE_ROOM} br
      LEFT JOIN bill_transaction_information bt ON br.id = bt.bill_room_id AND bt.status != 2
      WHERE br.bill_id = ? AND br.status != 2
    `;
    const [summaryResult] = await db.execute(summaryQuery, [parseInt(bill_id)]);
    const summary = summaryResult[0];

    // Count status_3 (overdue: status=0 and current date > expire_date)
    // isOverdue already calculated above (line 993)
    const status_3 = isOverdue ? summary.status_0 : 0;

    // Get notification resend interval from config
    const configQuery = `
      SELECT config_value
      FROM app_config
      WHERE config_key = 'notification_resend_interval_minutes' AND is_active = TRUE
    `;
    const [configRows] = await db.execute(configQuery);
    const intervalMinutes = configRows.length > 0 ? parseInt(configRows[0].config_value) : 30;

    // Get data with pagination + notification status
    const dataQuery = `
      SELECT
        br.id, br.bill_id, br.bill_no, br.house_no, br.member_name,
        br.total_price, br.remark, br.status, br.create_date, br.create_by,
        na.last_notification_date,
        TIMESTAMPDIFF(MINUTE, na.last_notification_date, NOW()) as minutes_since_last_notification,
        CASE
          WHEN na.last_notification_date IS NULL THEN 1
          WHEN TIMESTAMPDIFF(MINUTE, na.last_notification_date, NOW()) >= ${intervalMinutes} THEN 1
          ELSE 0
        END as can_send_notification,
        CASE
          WHEN na.last_notification_date IS NULL THEN NULL
          WHEN TIMESTAMPDIFF(MINUTE, na.last_notification_date, NOW()) >= ${intervalMinutes} THEN 0
          ELSE ${intervalMinutes} - TIMESTAMPDIFF(MINUTE, na.last_notification_date, NOW())
        END as remaining_minutes
      FROM ${TABLE_ROOM} br
      LEFT JOIN (
        SELECT
          rows_id,
          MAX(create_date) as last_notification_date
        FROM notification_audit_information
        WHERE table_name = 'bill_room_information'
        GROUP BY rows_id
      ) na ON br.id = na.rows_id
      ${whereClause}
      ORDER BY br.create_date ASC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    const [rows] = await db.execute(dataQuery, queryParams);

    // Format dates for items and adjust status for overdue items
    const formattedRows = addFormattedDatesToList(rows, ['create_date', 'last_notification_date']).map(row => {
      // If status = 0 and current date > expire_date, change status to 3
      if (row.status === 0 && isOverdue) {
        row.status = 3;
      }
      return row;
    });

    // Format bill info dates (including expire_date)
    const formattedBillInfo = addFormattedDates(billInfo, ['create_date', 'send_date', 'expire_date']);

    // Check if Excel export is requested
    if (type === 'excel') {
      // Create workbook and worksheet
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Bill Room List');

      // Define columns
      worksheet.columns = [
        { header: 'เลขที่บิล', key: 'bill_no', width: 20 },
        { header: 'เลขห้อง', key: 'house_no', width: 12 },
        { header: 'ชื่อลูกบ้าน', key: 'member_name', width: 25 },
        { header: 'ยอดเงิน', key: 'total_price', width: 15 },
        { header: 'วันครบกำหนด', key: 'expire_date', width: 15 },
        { header: 'สถานะชำระ', key: 'payment_status', width: 15 }
      ];

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.height = 25;

      headerRow.eachCell({ includeEmpty: false }, (cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4472C4' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'thin', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
      });

      // Add data rows
      formattedRows.forEach(item => {
        // Extract date only from expire_date_formatted (format: DD/MM/YYYY HH:mm:ss -> DD/MM/YYYY)
        const expireDateOnly = formattedBillInfo.expire_date_formatted
          ? formattedBillInfo.expire_date_formatted.split(' ')[0]
          : '-';

        // Determine payment status text
        let paymentStatus = '-';
        if (formattedBillInfo.status == 0) {
          // Bill not sent yet
          paymentStatus = '-';
        } else if (formattedBillInfo.status == 1) {
          // Bill sent, check item status
          if (item.status === 1) {
            paymentStatus = 'ชำระแล้ว';
          } else if (item.status === 0) {
            paymentStatus = 'รอชำระ';
          } else if (item.status === 3) {
            paymentStatus = 'เกินกำหนด';
          } else if (item.status === 4) {
            paymentStatus = 'ชำระบางส่วน';
          }
        }

        const rowData = {
          bill_no: item.bill_no || '-',
          house_no: item.house_no || '-',
          member_name: item.member_name || '-',
          total_price: item.total_price ? `฿${formatNumber(item.total_price)}` : '-',
          expire_date: expireDateOnly,
          payment_status: paymentStatus
        };

        const excelRow = worksheet.addRow(rowData);

        // Add border to data cells
        excelRow.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
            left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
            bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
            right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
          };
          cell.alignment = { vertical: 'middle' };
        });
      });

      // Generate Excel file buffer
      const excelBuffer = await workbook.xlsx.writeBuffer();

      // Generate file name with timestamp
      const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const fileName = `bill_room_list_${bill_id}_${timestamp}.xlsx`;

      // Set response headers for file download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', excelBuffer.length);

      // Send Excel file
      return res.send(excelBuffer);
    }

    res.json({
      success: true,
      data: {
        bill_info: formattedBillInfo,
        summary_data: {
          status_1: summary.status_1,
          status_0: summary.status_0,
          status_3: status_3,
          status_4: summary.status_4,
          paid: formatPrice(summary.paid)
        },
        total_rows: formatNumber(totalCount),
        valid_rows: formatNumber(totalCount),
        invalid_rows: formatNumber(0),
        total_price: formatPrice(totalPriceSum),
        items: formattedRows
      },
      pagination: {
        current_page: pageNum,
        per_page: limitNum,
        total: totalCount,
        total_pages: Math.ceil(totalCount / limitNum),
        has_next: pageNum * limitNum < totalCount,
        has_prev: pageNum > 1
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get bill room list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bill room list',
      message: error.message
    });
  }
};

export const getBillRoomEachList = async (req, res) => {
  try {
    const { page = 1, limit = 10, house_no, customer_id } = req.query;

    if (!house_no || !customer_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        message: 'กรุณาระบุ house_no และ customer_id',
        required: ['house_no', 'customer_id']
      });
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    const db = getDatabase();
    const currentDate = new Date();

    // Helper function to format date as DD/MM/YYYY
    const formatDate = (date) => {
      if (!date) return '-';
      const d = new Date(date);
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    };

    // Get summary data (all records without pagination)
    const summaryQuery = `
      SELECT
        br.status,
        b.expire_date
      FROM ${TABLE_ROOM} br
      INNER JOIN ${TABLE_INFORMATION} b ON br.bill_id = b.id
      WHERE br.house_no = ?
        AND br.customer_id = ?
        AND br.status != 2
        AND b.status = 1
      ORDER BY b.expire_date DESC
    `;
    const [summaryRows] = await db.execute(summaryQuery, [house_no, customer_id]);

    // Calculate summary data
    const totalRecords = summaryRows.length;
    let pendingCount = 0; // status = 0
    let paidCount = 0;     // status = 1
    let nextPaymentDate = null;

    summaryRows.forEach(row => {
      const expireDate = new Date(row.expire_date);
      const isOverdue = currentDate > expireDate;

      if (row.status === 0) {
        pendingCount++;
        // หา expire_date ที่ใกล้ที่สุดของรายการที่ status = 0
        if (!nextPaymentDate || expireDate < nextPaymentDate) {
          nextPaymentDate = expireDate;
        }
      } else if (row.status === 1) {
        paidCount++;
      }
    });

    // Calculate payment completion
    const completionPercentage = totalRecords > 0 ? Math.round((paidCount / totalRecords) * 100) : 0;
    const completionText = `${paidCount}/${totalRecords} ครั้ง (${completionPercentage}%)`;

    // Get paginated data with bill information
    const dataQuery = `
      SELECT
        br.id,
        br.bill_id,
        br.bill_no,
        br.house_no,
        br.member_name,
        br.total_price,
        br.remark,
        br.status,
        br.create_date,
        b.title as bill_title,
        b.expire_date
      FROM ${TABLE_ROOM} br
      INNER JOIN ${TABLE_INFORMATION} b ON br.bill_id = b.id
      WHERE br.house_no = ?
        AND br.customer_id = ?
        AND br.status != 2
        AND b.status = 1
      ORDER BY b.expire_date DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    const [rows] = await db.execute(dataQuery, [house_no, customer_id]);

    // Format data with date formatting and status adjustment
    const formattedRows = rows.map(row => {
      const expireDate = new Date(row.expire_date);
      const isOverdue = currentDate > expireDate;

      // Adjust status: if status = 0 and overdue, change to 3
      let adjustedStatus = row.status;
      if (row.status === 0 && isOverdue) {
        adjustedStatus = 3;
      }

      return {
        id: row.id,
        bill_id: row.bill_id,
        bill_no: row.bill_no,
        bill_title: row.bill_title,
        expire_date: formatDate(expireDate),
        total_price: formatPrice(row.total_price),
        status: adjustedStatus
      };
    });

    res.json({
      success: true,
      data: {
        summary_data: {
          pending_amount: pendingCount,
          payment_completion: completionText,
          next_payment_date: formatDate(nextPaymentDate)
        },
        items: formattedRows
      },
      pagination: {
        current_page: pageNum,
        per_page: limitNum,
        total: totalRecords,
        total_pages: Math.ceil(totalRecords / limitNum),
        has_next: pageNum * limitNum < totalRecords,
        has_prev: pageNum > 1
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get bill room each list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bill room each list',
      message: error.message
    });
  }
};

export const getSummaryData = async (req, res) => {
  try {
    const { customer_id } = req.query;

    if (!customer_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter',
        message: 'กรุณาระบุ customer_id',
        required: ['customer_id']
      });
    }

    const db = getDatabase();

    // Card 1: บิลในระบบ (Total bills in system)
    const billCountQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_INFORMATION}
      WHERE customer_id = ? AND status != 2
    `;
    const [billCountResult] = await db.execute(billCountQuery, [customer_id]);
    const totalBills = billCountResult[0].total;

    // Card 1: บิลที่สร้างในเดือนนี้
    // Use MySQL DATE functions for timezone-safe month range
    const billThisMonthQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_INFORMATION}
      WHERE customer_id = ? AND status != 2
        AND create_date >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')
        AND create_date <= LAST_DAY(NOW()) + INTERVAL 1 DAY - INTERVAL 1 SECOND
    `;
    const [billThisMonthResult] = await db.execute(billThisMonthQuery, [customer_id]);
    const billsThisMonth = billThisMonthResult[0].total;

    // Card 2: บิลที่แจ้งแล้ว (Sent bills - status = 1)
    const sentBillQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_INFORMATION}
      WHERE customer_id = ? AND status = 1
    `;
    const [sentBillResult] = await db.execute(sentBillQuery, [customer_id]);
    const totalSentBills = sentBillResult[0].total;

    // Card 2: บิลที่แจ้งในเดือนนี้
    const sentBillThisMonthQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_INFORMATION}
      WHERE customer_id = ? AND status = 1
        AND send_date >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')
        AND send_date <= LAST_DAY(NOW()) + INTERVAL 1 DAY - INTERVAL 1 SECOND
    `;
    const [sentBillThisMonthResult] = await db.execute(sentBillThisMonthQuery, [customer_id]);
    const sentBillsThisMonth = sentBillThisMonthResult[0].total;

    // Card 3: รอการชำระ (Pending payment - bill_room_information.status = 0 และ bill_information.status = 1 เท่านั้น)
    const pendingPaymentQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_ROOM} br
      INNER JOIN ${TABLE_INFORMATION} b ON br.bill_id = b.id
      WHERE b.customer_id = ? AND b.status = 1 AND br.status = 0
    `;
    const [pendingPaymentResult] = await db.execute(pendingPaymentQuery, [customer_id]);
    const totalPendingPayment = pendingPaymentResult[0].total;

    // Card 3: รายการรอชำระที่สร้างในเดือนนี้
    const pendingPaymentThisMonthQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_ROOM} br
      INNER JOIN ${TABLE_INFORMATION} b ON br.bill_id = b.id
      WHERE b.customer_id = ? AND b.status = 1 AND br.status = 0
        AND br.create_date >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')
        AND br.create_date <= LAST_DAY(NOW()) + INTERVAL 1 DAY - INTERVAL 1 SECOND
    `;
    const [pendingPaymentThisMonthResult] = await db.execute(pendingPaymentThisMonthQuery, [customer_id]);
    const pendingPaymentThisMonth = pendingPaymentThisMonthResult[0].total;

    // Card 4: ชำระเรียบร้อย (Paid - bill_room_information.status = 1)
    const paidQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_ROOM} br
      INNER JOIN ${TABLE_INFORMATION} b ON br.bill_id = b.id
      WHERE b.customer_id = ? AND b.status != 2 AND br.status = 1
    `;
    const [paidResult] = await db.execute(paidQuery, [customer_id]);
    const totalPaid = paidResult[0].total;

    // Card 4: รายการที่ชำระในเดือนนี้
    const paidThisMonthQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_ROOM} br
      INNER JOIN ${TABLE_INFORMATION} b ON br.bill_id = b.id
      WHERE b.customer_id = ? AND b.status != 2 AND br.status = 1
        AND br.create_date >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')
        AND br.create_date <= LAST_DAY(NOW()) + INTERVAL 1 DAY - INTERVAL 1 SECOND
    `;
    const [paidThisMonthResult] = await db.execute(paidThisMonthQuery, [customer_id]);
    const paidThisMonth = paidThisMonthResult[0].total;

    // Card 5: ห้องทั้งหมด (Total unique rooms - เฉพาะ bill_information.status = 1 ส่งแล้ว)
    const totalRoomsQuery = `
      SELECT COUNT(DISTINCT br.house_no) as total
      FROM ${TABLE_ROOM} br
      INNER JOIN ${TABLE_INFORMATION} b ON br.bill_id = b.id
      WHERE b.customer_id = ? AND b.status = 1 AND br.status != 2
    `;
    const [totalRoomsResult] = await db.execute(totalRoomsQuery, [customer_id]);
    const totalRooms = totalRoomsResult[0].total;

    // Card 5: ห้องที่เพิ่มขึ้นในเดือนนี้
    const newRoomsThisMonthQuery = `
      SELECT COUNT(DISTINCT br.house_no) as total
      FROM ${TABLE_ROOM} br
      INNER JOIN ${TABLE_INFORMATION} b ON br.bill_id = b.id
      WHERE b.customer_id = ? AND b.status = 1 AND br.status != 2
        AND br.create_date >= DATE_FORMAT(NOW(), '%Y-%m-01 00:00:00')
        AND br.create_date <= LAST_DAY(NOW()) + INTERVAL 1 DAY - INTERVAL 1 SECOND
    `;
    const [newRoomsThisMonthResult] = await db.execute(newRoomsThisMonthQuery, [customer_id]);
    const newRoomsThisMonth = newRoomsThisMonthResult[0].total;

    // Calculate percentage for rooms (new rooms / total rooms * 100)
    const roomsPercentage = totalRooms > 0 ? Math.round((newRoomsThisMonth / totalRooms) * 100) : 0;

    res.json({
      success: true,
      data: {
        total_bills: {
          count: totalBills,
          change: billsThisMonth,
          change_text: billsThisMonth > 0 ? `+${billsThisMonth} เดือนนี้` : `0 เดือนนี้`
        },
        sent_bills: {
          count: totalSentBills,
          change: sentBillsThisMonth,
          change_text: sentBillsThisMonth > 0 ? `+${sentBillsThisMonth} เดือนนี้` : `0 เดือนนี้`
        },
        pending_payment: {
          count: totalPendingPayment,
          change: pendingPaymentThisMonth,
          change_text: pendingPaymentThisMonth > 0 ? `+${pendingPaymentThisMonth} เดือนนี้` : `0 เดือนนี้`
        },
        paid: {
          count: totalPaid,
          change: paidThisMonth,
          change_text: paidThisMonth > 0 ? `+${paidThisMonth} เดือนนี้` : `0 เดือนนี้`
        },
        total_rooms: {
          count: totalRooms,
          change: newRoomsThisMonth,
          change_percentage: roomsPercentage,
          change_text: roomsPercentage > 0 ? `+${roomsPercentage}% เดือนนี้` : `0% เดือนนี้`
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get summary data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch summary data',
      message: error.message
    });
  }
};

/**
 * Helper function to remove prefix from member name
 * @param {string} memberName - Full member name with prefix
 * @returns {string} Member name without prefix
 */
function removePrefix(memberName) {
  if (!memberName) return memberName;

  const prefixes = [
    'นาย', 'นาง', 'นางสาว', 'เด็กชาย', 'เด็กหญิง', 'คุณ',
    'Mr.', 'Mrs.', 'Miss', 'Ms.', 'Dr.'
  ];

  let result = memberName.trim();

  for (const prefix of prefixes) {
    // ตรวจสอบว่าขึ้นต้นด้วย prefix + space หรือไม่
    if (result.startsWith(prefix + ' ')) {
      result = result.substring(prefix.length + 1).trim();
      break;
    }
    // ตรวจสอบว่าขึ้นต้นด้วย prefix เฉยๆ (ไม่มี space)
    if (result.startsWith(prefix)) {
      result = result.substring(prefix.length).trim();
      break;
    }
  }

  return result;
}

export const getBillRoomPendingList = async (req, res) => {
  try {
    const { page = 1, limit = 10, keyword, customer_id, house_no, bill_type_id, status } = req.query;

    if (!customer_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter',
        message: 'กรุณาระบุ customer_id',
        required: ['customer_id']
      });
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    const db = getDatabase();
    const currentDate = new Date();

    // Build WHERE clause
    // Base condition: customer_id, bill status = 1 (sent), and not deleted
    let whereClause = 'WHERE b.customer_id = ? AND b.status = 1 AND br.status != 2';
    let queryParams = [customer_id];

    // Status filter
    // status = -1 or undefined: show all statuses except deleted (status 2)
    // status = specific value: filter by that status
    const statusValue = status !== undefined && status !== '' ? parseInt(status) : -1;

    if (statusValue === -1) {
      // Show all statuses except deleted (already filtered by br.status != 2 in base WHERE clause)
      // No additional status filter needed
    } else {
      // Filter by specific status
      // Status 0 = รอชำระ (ยังไม่เลยกำหนด, ไม่มียอดชำระ)
      // Status 3 = เกินกำหนด (เลยกำหนดแล้ว)
      // Status 4 = ชำระบางส่วน (partial payment)
      if (statusValue === 0 || statusValue === 3) {
        // Both are DB status = 0, will be separated by calculation
        whereClause += ' AND br.status = 0';
      } else if (statusValue === 4) {
        // Status 4 can be in DB or calculated, so we get both 0 and 4
        whereClause += ' AND (br.status = 0 OR br.status = 4)';
      } else {
        whereClause += ' AND br.status = ?';
        queryParams.push(statusValue);
      }
    }

    // Bill type filter
    if (bill_type_id !== undefined && bill_type_id !== '' && parseInt(bill_type_id) !== 0) {
      whereClause += ' AND b.bill_type_id = ?';
      queryParams.push(parseInt(bill_type_id));
    }

    // Optional house_no filter
    if (house_no && house_no.trim() !== '') {
      whereClause += ' AND br.house_no = ?';
      queryParams.push(house_no.trim());
    }

    // Keyword search
    if (keyword && keyword.trim() !== '') {
      whereClause += ' AND (br.bill_no LIKE ? OR br.member_name LIKE ? OR br.house_no LIKE ? OR b.title LIKE ?)';
      const searchTerm = `%${keyword.trim()}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Count total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_ROOM} br
      INNER JOIN ${TABLE_INFORMATION} b ON br.bill_id = b.id
      ${whereClause}
    `;
    const [countResult] = await db.execute(countQuery, queryParams);
    const total = countResult[0].total;

    // Get data with pagination
    const dataQuery = `
      SELECT
        br.id,
        br.bill_no,
        br.member_name,
        br.house_no,
        br.total_price,
        br.status as original_status,
        b.title,
        b.expire_date,
        COALESCE(SUM(bt.transaction_amount), 0) as total_paid,
        (br.total_price - COALESCE(SUM(bt.transaction_amount), 0)) as remaining_amount
      FROM ${TABLE_ROOM} br
      INNER JOIN ${TABLE_INFORMATION} b ON br.bill_id = b.id
      LEFT JOIN bill_transaction_information bt ON br.id = bt.bill_room_id AND bt.status != 2
      ${whereClause}
      GROUP BY br.id, br.bill_no, br.member_name, br.house_no, br.total_price, br.status, b.title, b.expire_date
      ORDER BY b.expire_date DESC, br.create_date DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    const [rows] = await db.execute(dataQuery, queryParams);

    // Format data with status adjustment and filter by specific status if needed
    let formattedRows = rows.map(row => {
      const expireDate = new Date(row.expire_date);
      const isOverdue = currentDate > expireDate;

      // Adjust status: if original_status = 0 and overdue, change to 3
      // But also check if there's partial payment (total_paid > 0 but < total_price)
      let adjustedStatus = row.original_status;
      const totalPaid = parseFloat(row.total_paid);
      const totalPrice = parseFloat(row.total_price);

      if (row.original_status === 0) {
        if (totalPaid > 0 && totalPaid < totalPrice) {
          // มียอดชำระบางส่วน
          adjustedStatus = 4;
        } else if (isOverdue) {
          // เลยกำหนดชำระ
          adjustedStatus = 3;
        }
      }

      return {
        id: row.id,
        bill_no: row.bill_no,
        member_name: row.member_name,
        member_real_name: removePrefix(row.member_name),
        house_no: row.house_no,
        title: row.title,
        total_price: formatPrice(row.total_price),
        total_paid: formatPrice(totalPaid),
        remaining_amount: formatPrice(parseFloat(row.remaining_amount)),
        expire_date: addFormattedDates({ expire_date: row.expire_date }, ['expire_date']).expire_date_formatted,
        status: adjustedStatus
      };
    });

    // Filter by specific status after calculation if status filter is applied
    if (statusValue !== -1) {
      if (statusValue === 0) {
        // Show only non-overdue pending bills (status = 0 and not overdue)
        formattedRows = formattedRows.filter(row => row.status === 0);
      } else if (statusValue === 3) {
        // Show only overdue bills (status = 3)
        formattedRows = formattedRows.filter(row => row.status === 3);
      } else if (statusValue === 4) {
        // Show only partial payment bills (status = 4)
        formattedRows = formattedRows.filter(row => row.status === 4);
      }
    }

    res.json({
      success: true,
      data: formattedRows,
      pagination: {
        current_page: pageNum,
        per_page: limitNum,
        total: total,
        total_pages: Math.ceil(total / limitNum),
        has_next: pageNum * limitNum < total,
        has_prev: pageNum > 1
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get bill room pending list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bill room pending list',
      message: error.message
    });
  }
};

export const getBillStatus = async (req, res) => {
  try {
    const statusList = [
      { id: -1, title: 'ทุกสถานะ' },
      { id: 0, title: 'รอชำระ' },
      { id: 5, title: 'รอตรวจสอบ' },
      { id: 3, title: 'เกินกำหนด' },
      { id: 1, title: 'ชำระแล้ว' }
    ];

    res.json({
      success: true,
      data: statusList,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get bill status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bill status',
      message: error.message
    });
  }
};

export const getBillExcelList = async (req, res) => {
  try {
    const { upload_key } = req.query;

    if (!upload_key) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter',
        message: 'กรุณาระบุ upload_key',
        required: ['upload_key']
      });
    }

    const db = getDatabase();

    // Step 1: Query Excel file from bill_attachment
    const attachmentQuery = `
      SELECT file_path, file_name, file_ext
      FROM ${TABLE_ATTACHMENT}
      WHERE upload_key = ? AND status != 2
      ORDER BY create_date DESC
      LIMIT 1
    `;

    const [attachments] = await db.execute(attachmentQuery, [upload_key.trim()]);

    if (attachments.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Excel file not found',
        message: 'กรุณานำเข้าข้อมูลรายการบิล'
      });
    }

    const attachment = attachments[0];
    const filePath = attachment.file_path;
    const fileExt = attachment.file_ext.toLowerCase();

    // Step 2: Validate file extension
    if (fileExt !== 'xlsx' && fileExt !== 'xls' && fileExt !== 'csv') {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type',
        message: 'ไฟล์ต้องเป็น Excel (.xlsx, .xls) หรือ CSV (.csv) เท่านั้น'
      });
    }

    // Step 3: Read and parse Excel/CSV file
    let workbook;
    try {
      workbook = await readExcelFile(filePath, fileExt);
    } catch (error) {
      logger.error('Error reading file:', error);
      return res.status(400).json({
        success: false,
        error: 'Failed to read file',
        message: 'ไม่สามารถอ่านไฟล์ได้ ไฟล์อาจเสียหาย หรือไม่พบไฟล์บนเซิร์ฟเวอร์'
      });
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // ตรวจสอบว่าไฟล์เป็น HTML-based Excel หรือไม่ (ข้ามการเช็คสำหรับ CSV)
    if (fileExt !== 'csv' && !worksheet['A1'] && !worksheet['B1'] && !worksheet['C1']) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Excel file format',
        message: 'ไฟล์ Excel ไม่ถูกต้อง กรุณาใช้ไฟล์ .xlsx หรือ .xls ที่สร้างจาก Microsoft Excel โดยตรง',
        hint: 'ลองเปิดไฟล์ด้วย Microsoft Excel แล้ว Save As เป็น .xlsx ใหม่'
      });
    }

    // อ่าน Excel/CSV
    const data = xlsx.utils.sheet_to_json(worksheet, {
      defval: null,
      blankrows: false,
      raw: false  // แปลง value เป็น string เพื่อให้ใช้งานง่าย
    });

    // Step 5: Validate file data
    if (!data || data.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'File is empty',
        message: 'ไฟล์ไม่มีข้อมูล'
      });
    }

    // Validate column headers
    const requiredColumns = ['เลขห้อง', 'ชื่อลูกบ้าน', 'ยอดเงิน'];
    const firstRow = data[0];
    const actualColumns = Object.keys(firstRow);
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));

    if (missingColumns.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required columns',
        message: `ไฟล์ต้องมี columns: ${missingColumns.join(', ')}`,
        missing_columns: missingColumns,
        actual_columns: actualColumns
      });
    }

    // Step 6: Process and validate each row
    const items = [];
    let validCount = 0;
    let invalidCount = 0;
    let totalPriceSum = 0; // รวมยอดเงินของแถวที่ถูกต้อง

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 1; // ลำดับที่แสดงใน UI (เริ่มจาก 1)

      // แปลงเลขห้อง: ถ้าเป็น date string ที่มีรูปแบบ "11/1/01" หรือ "1/11/01" ให้แปลงเป็น "11/01"
      let houseNoRaw = row['เลขห้อง'];
      if (houseNoRaw && typeof houseNoRaw === 'string') {
        // ตรวจสอบว่าเป็น date format 3 ส่วน (เช่น "11/1/01" หรือ "1/11/01")
        const datePattern = /^(\d{1,2})\/(\d{1,2})\/(\d{1,2})$/;
        const match = houseNoRaw.match(datePattern);
        if (match) {
          // เลือกเอา 2 ส่วนแรก มาเป็นเลขห้อง (ส่วนที่ 1 และ 2)
          const part1 = match[1].padStart(2, '0');
          const part2 = match[2].padStart(2, '0');
          houseNoRaw = `${part1}/${part2}`;
        }
      }

      const memberNameRaw = row['ชื่อลูกบ้าน'];
      const totalPriceRaw = row['ยอดเงิน'];
      const remarkRaw = row['หมายเหตุ'];

      // ตรวจสอบความถูกต้องของ 3 ฟิลด์หลัก
      const houseNo = houseNoRaw?.toString().trim();
      const memberName = memberNameRaw?.toString().trim();
      const totalPriceStr = totalPriceRaw?.toString().trim();

      let status = 1; // default: ถูกต้อง
      let errorMessage = null;

      // ตรวจสอบว่ามีข้อมูลครบหรือไม่
      const isHouseNoMissing = !houseNo;
      const isMemberNameMissing = !memberName;
      const isTotalPriceMissing = !totalPriceStr;

      if (isHouseNoMissing || isMemberNameMissing || isTotalPriceMissing) {
        status = 0;
        errorMessage = 'ขาดข้อมูลจำเป็น (เลขห้อง, ชื่อลูกบ้าน, หรือยอดเงิน)';
        invalidCount++;
      } else {
        // ตรวจสอบว่ายอดเงินเป็นตัวเลขหรือไม่
        const priceValue = parseFloat(totalPriceStr);
        if (isNaN(priceValue)) {
          status = 0;
          errorMessage = 'ยอดเงินไม่ใช่ตัวเลข';
          invalidCount++;
        } else {
          validCount++;
          totalPriceSum += priceValue; // รวมยอดเงินของแถวที่ถูกต้อง
        }
      }

      // จัดรูปแบบข้อมูลสำหรับแสดง UI
      const item = {
        row_number: rowNum,
        house_no: isHouseNoMissing ? 'ไม่ระบุ' : houseNo,
        member_name: isMemberNameMissing ? 'ไม่ระบุ' : memberName,
        total_price: isTotalPriceMissing ? 'ไม่ระบุ' : totalPriceStr,
        remark: remarkRaw?.toString().trim() || '-',
        status: status
      };

      if (errorMessage) {
        item.error_message = errorMessage;
      }

      items.push(item);
    }

    res.json({
      success: true,
      data: {
        total_rows: formatNumber(data.length),
        valid_rows: formatNumber(validCount),
        invalid_rows: formatNumber(invalidCount),
        total_price: formatPrice(totalPriceSum),
        items: items
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get bill excel list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bill excel list',
      message: error.message
    });
  }
};

export const sendNotificationEach = async (req, res) => {
  try {
    const { customer_id, table_name, id, uid } = req.body;

    // Validate required fields
    if (!customer_id || !table_name || !id || !uid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: customer_id, table_name, id, uid',
        required: ['customer_id', 'table_name', 'id', 'uid']
      });
    }

    const db = getDatabase();

    // Get notification resend interval from config
    const configQuery = `
      SELECT config_value
      FROM app_config
      WHERE config_key = 'notification_resend_interval_minutes' AND is_active = TRUE
    `;
    const [configRows] = await db.execute(configQuery);
    const intervalMinutes = configRows.length > 0 ? parseInt(configRows[0].config_value) : 30;

    // Check last notification audit create_date for this specific bill_room
    // Check ANY notification (regardless of remark) to prevent spam
    // Use TIMESTAMPDIFF to calculate minutes directly in MySQL (timezone-safe)
    const lastNotificationQuery = `
      SELECT
        create_date,
        remark,
        TIMESTAMPDIFF(MINUTE, create_date, NOW()) as minutes_passed
      FROM notification_audit_information
      WHERE table_name = ? AND rows_id = ? AND customer_id = ?
      ORDER BY create_date DESC
      LIMIT 1
    `;
    const [lastNotificationRows] = await db.execute(lastNotificationQuery, [table_name, parseInt(id), customer_id]);

    if (lastNotificationRows.length > 0) {
      const timeDiffMinutes = lastNotificationRows[0].minutes_passed;

      // Check if enough time has passed
      if (timeDiffMinutes < intervalMinutes) {
        const remainingMinutes = intervalMinutes - timeDiffMinutes;
        return res.status(400).json({
          success: false,
          error: 'Notification sent too recently',
          message: `ต้องรออีก ${remainingMinutes} นาที ก่อนส่งการแจ้งเตือนอีกครั้ง`,
          details: {
            last_sent: lastNotificationRows[0].create_date,
            last_remark: lastNotificationRows[0].remark,
            interval_required_minutes: intervalMinutes,
            time_passed_minutes: timeDiffMinutes,
            remaining_minutes: remainingMinutes
          }
        });
      }
    }

    // Call helper function to insert notification audit
    // mode='bill_room' creates notification for single bill_room only
    const insertedCount = await insertNotificationAuditForBill(
      db,
      parseInt(id),      // bill_room_id
      customer_id,
      uid,
      'ส่งอีกครั้ง',     // remark
      { mode: 'bill_room' }
    );

    if (insertedCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bill room not found or notification could not be created',
        message: 'ไม่พบข้อมูล bill_room หรือไม่สามารถสร้างการแจ้งเตือนได้'
      });
    }

    logger.info(`Notification resent for ${table_name} ID: ${id} by user ${uid}`);

    res.json({
      success: true,
      message: 'Notification sent successfully',
      data: {
        table_name,
        rows_id: parseInt(id),
        customer_id,
        remark: 'ส่งอีกครั้ง',
        create_by: uid,
        notifications_created: insertedCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Send notification each error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send notification',
      message: error.message
    });
  }
};

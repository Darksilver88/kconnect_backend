import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { addFormattedDates, addFormattedDatesToList } from '../utils/dateFormatter.js';

const TABLE_TRANSACTION_TYPE = 'bill_transaction_type_information';

/**
 * Insert bill transaction (manual payment entry by admin)
 * POST /api/bill_transaction/insert
 * Body: {
 *   bill_room_id: INT (required),
 *   bill_transaction_type_id: INT (required) - ID from bill_transaction_type_information,
 *   transaction_amount: DECIMAL (required) - จำนวนเงินที่ชำระ,
 *   pay_date: TIMESTAMP (required) - วันที่ชำระ,
 *   transaction_type_json: JSON (optional) - ข้อมูลเพิ่มเติมตาม bill_transaction_type_id,
 *   remark: TEXT (optional) - หมายเหตุ,
 *   customer_id: STRING (required),
 *   uid: INT (required) - user ID
 * }
 */
export const insertBillTransaction = async (req, res) => {
  try {
    const db = getDatabase();
    const { bill_room_id, bill_transaction_type_id, transaction_amount, pay_date, transaction_type_json, remark, customer_id, uid } = req.body;

    // Validate required fields
    const requiredFields = [];
    if (!bill_room_id) requiredFields.push('bill_room_id');
    if (!bill_transaction_type_id) requiredFields.push('bill_transaction_type_id');
    if (!transaction_amount) requiredFields.push('transaction_amount');
    if (!pay_date) requiredFields.push('pay_date');
    if (!customer_id) requiredFields.push('customer_id');
    if (!uid) requiredFields.push('uid');

    if (requiredFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: `กรุณากรอกข้อมูลที่จำเป็น: ${requiredFields.join(', ')}`,
        required: requiredFields
      });
    }

    // Validate transaction_amount is a positive number
    const amountValue = parseFloat(transaction_amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid transaction amount',
        message: 'จำนวนเงินที่ชำระต้องเป็นตัวเลขที่มากกว่า 0'
      });
    }

    // Validate bill_transaction_type_id exists in bill_transaction_type_information
    const billTransactionTypeId = parseInt(bill_transaction_type_id);
    if (isNaN(billTransactionTypeId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid bill transaction type',
        message: 'รหัสวิธีการชำระเงินไม่ถูกต้อง'
      });
    }

    const [transactionTypeRows] = await db.execute(
      'SELECT id FROM bill_transaction_type_information WHERE id = ? AND status != 2',
      [billTransactionTypeId]
    );

    if (transactionTypeRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bill transaction type not found',
        message: 'ไม่พบวิธีการชำระเงินนี้ในระบบ'
      });
    }

    // Parse and validate transaction_type_json JSON
    let transactionTypeJsonString = null;
    if (transaction_type_json) {
      try {
        // If it's already an object, stringify it. If it's a string, parse then stringify
        if (typeof transaction_type_json === 'string') {
          transactionTypeJsonString = JSON.stringify(JSON.parse(transaction_type_json));
        } else if (typeof transaction_type_json === 'object') {
          transactionTypeJsonString = JSON.stringify(transaction_type_json);
        }
      } catch (error) {
        return res.status(400).json({
          success: false,
          error: 'Invalid transaction type json format',
          message: 'รูปแบบข้อมูล transaction_type_json ไม่ถูกต้อง (ต้องเป็น valid JSON)'
        });
      }
    }

    // Check if bill_room_id exists and not deleted
    const [billRoomRows] = await db.execute(
      'SELECT id, total_price, status FROM bill_room_information WHERE id = ? AND status != 2',
      [bill_room_id]
    );

    if (billRoomRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bill room not found',
        message: 'ไม่พบรายการบิลนี้ในระบบ'
      });
    }

    const billRoom = billRoomRows[0];

    // Check current total paid amount for this bill_room
    const [transactionRows] = await db.execute(
      'SELECT COALESCE(SUM(transaction_amount), 0) as total_paid FROM bill_transaction_information WHERE bill_room_id = ? AND status != 2',
      [bill_room_id]
    );

    const totalPaid = parseFloat(transactionRows[0].total_paid);
    const newTotalPaid = totalPaid + amountValue;
    const totalPrice = parseFloat(billRoom.total_price);

    // Determine transaction type (full or partial)
    let transactionType = 'partial';
    let newBillRoomStatus = 4; // partial payment

    if (newTotalPaid >= totalPrice) {
      transactionType = 'full';
      newBillRoomStatus = 1; // paid
    }

    // Insert transaction record (payment_id is NULL for manual entry)
    const insertQuery = `
      INSERT INTO bill_transaction_information
      (bill_room_id, payment_id, transaction_amount, bill_transaction_type_id, transaction_type_json, pay_date, transaction_type, remark, customer_id, status, create_by)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `;

    const [result] = await db.execute(insertQuery, [
      bill_room_id,
      amountValue,
      billTransactionTypeId,
      transactionTypeJsonString,
      pay_date,
      transactionType,
      remark || null,
      customer_id,
      uid
    ]);

    // Update bill_room_information status
    await db.execute(
      'UPDATE bill_room_information SET status = ?, update_date = NOW(), update_by = ? WHERE id = ?',
      [newBillRoomStatus, uid, bill_room_id]
    );

    logger.info(`Bill transaction inserted: id=${result.insertId}, bill_room_id=${bill_room_id}, amount=${amountValue}, type=${transactionType}, new_status=${newBillRoomStatus}, by user=${uid}`);

    // Fetch the inserted record with formatted dates
    const [insertedRows] = await db.execute(
      'SELECT * FROM bill_transaction_information WHERE id = ?',
      [result.insertId]
    );

    const formattedData = addFormattedDates(insertedRows[0], ['create_date', 'update_date', 'delete_date', 'pay_date', 'transaction_date']);

    res.status(201).json({
      success: true,
      message: 'บันทึกรายการชำระเงินสำเร็จ',
      data: {
        ...formattedData,
        bill_room_status: newBillRoomStatus,
        total_paid: newTotalPaid,
        total_price: totalPrice,
        remaining: totalPrice - newTotalPaid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Insert bill transaction error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to insert bill transaction',
      message: 'เกิดข้อผิดพลาดในการบันทึกรายการชำระเงิน',
      details: error.message
    });
  }
};

/**
 * Get bill transaction type list
 * GET /api/bill_transaction/bill_transaction_type
 */
export const getBillTransactionType = async (req, res) => {
  try {
    const db = getDatabase();

    const query = `
      SELECT id, title, status
      FROM ${TABLE_TRANSACTION_TYPE}
      WHERE status != 2
      ORDER BY id ASC
    `;

    const [rows] = await db.execute(query);

    res.json({
      success: true,
      data: rows,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get bill transaction type error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bill transaction types',
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลประเภทการชำระเงิน'
    });
  }
};

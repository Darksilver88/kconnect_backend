import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { addFormattedDatesToList } from '../utils/dateFormatter.js';
import { formatPrice } from '../utils/numberFormatter.js';
import { getFileUrl } from '../utils/storageManager.js';

const MENU = 'payment';
const TABLE_INFORMATION = `${MENU}_information`;

export const insertPayment = async (req, res) => {
  try {
    const { upload_key, payable_type, payable_id, payment_amount, payment_type_id, customer_id, status, member_id, remark, uid } = req.body;

    if (!upload_key || !payable_type || !payable_id || !payment_amount || !payment_type_id || !customer_id || status === undefined || !member_id || !uid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: upload_key, payable_type, payable_id, payment_amount, payment_type_id, customer_id, status, member_id, uid',
        required: ['upload_key', 'payable_type', 'payable_id', 'payment_amount', 'payment_type_id', 'customer_id', 'status', 'member_id', 'uid']
      });
    }

    const db = getDatabase();

    // Check if payment_attachment exists with status = 1
    const attachmentCheckQuery = `
      SELECT id FROM payment_attachment
      WHERE upload_key = ? AND status = 1
      LIMIT 1
    `;
    const [attachmentRows] = await db.execute(attachmentCheckQuery, [upload_key?.trim()]);

    if (attachmentRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Payment slip required',
        message: 'กรุณาแนบสลิป'
      });
    }

    const insertQuery = `
      INSERT INTO ${TABLE_INFORMATION} (upload_key, payable_type, payable_id, payment_amount, payment_type_id, customer_id, status, member_id, remark, create_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const payableIdValue = parseInt(payable_id);
    const paymentAmount = parseFloat(payment_amount);
    const paymentTypeIdValue = parseInt(payment_type_id);
    const memberIdValue = parseInt(member_id);

    const [result] = await db.execute(insertQuery, [
      upload_key?.trim(),
      payable_type?.trim(),
      payableIdValue,
      paymentAmount,
      paymentTypeIdValue,
      customer_id?.trim(),
      status,
      memberIdValue,
      remark?.trim() || null,
      uid
    ]);

    res.json({
      success: true,
      message: 'Payment inserted successfully',
      data: {
        id: result.insertId,
        upload_key,
        payable_type: payable_type?.trim(),
        payable_id: payableIdValue,
        payment_amount: paymentAmount,
        payment_type_id: paymentTypeIdValue,
        customer_id,
        status,
        member_id: memberIdValue,
        remark,
        create_by: uid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Insert payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to insert payment',
      message: error.message
    });
  }
};

export const updatePayment = async (req, res) => {
  try {
    let { ids, uid, status, remark } = req.body;

    // Parse ids if it's a string (form-data support)
    if (typeof ids === 'string') {
      // Remove brackets if present: "[1,2,3]" -> "1,2,3"
      ids = ids.replace(/^\[|\]$/g, '').trim();
      // Split by comma and convert to integers
      ids = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    }

    // Validate ids
    if (!ids || !Array.isArray(ids) || ids.length === 0 || !uid || status === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: ids (array), uid, status',
        required: ['ids', 'uid', 'status']
      });
    }

    // Status must be 1 (approved) or 3 (rejected) only
    const statusValue = parseInt(status);
    if (statusValue !== 1 && statusValue !== 3) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status value',
        message: 'สถานะต้องเป็น 1 (อนุมัติ) หรือ 3 (ปฏิเสธ) เท่านั้น',
        allowed_status: [1, 3]
      });
    }

    // If status is 3 (rejected), remark is required
    if (statusValue === 3 && (!remark || remark.trim() === '')) {
      return res.status(400).json({
        success: false,
        error: 'Remark required for rejection',
        message: 'กรุณาระบุเหตุผลในการปฏิเสธ',
        required: ['remark']
      });
    }

    const db = getDatabase();

    const results = {
      success: [],
      failed: []
    };

    for (const id of ids) {
      try {
        // Check if payment exists and status is 0, also get payable info
        const checkQuery = `
          SELECT id, status, payable_type, payable_id FROM ${TABLE_INFORMATION}
          WHERE id = ? AND status != 2
        `;
        const [rows] = await db.execute(checkQuery, [id]);

        if (rows.length === 0) {
          results.failed.push({
            id: parseInt(id),
            reason: 'ไม่พบข้อมูลการแจ้งชำระ'
          });
          continue;
        }

        if (parseInt(rows[0].status) !== 0) {
          results.failed.push({
            id: parseInt(id),
            reason: 'สามารถอัปเดตได้เฉพาะรายการที่มีสถานะรอการอนุมัติเท่านั้น',
            current_status: rows[0].status
          });
          continue;
        }

        const paymentData = rows[0];

        // Update payment
        const updateQuery = `
          UPDATE ${TABLE_INFORMATION}
          SET status = ?, remark = ?, update_date = NOW(), update_by = ?
          WHERE id = ? AND status = 0
        `;

        const [result] = await db.execute(updateQuery, [
          status,
          remark?.trim() || null,
          uid,
          id
        ]);

        if (result.affectedRows > 0) {
          // ถ้าอนุมัติ (status = 1) และเป็น bill_room_information
          if (statusValue === 1 && paymentData.payable_type === 'bill_room_information') {
            try {
              // 1. Get payment details (amount, customer_id)
              const getPaymentQuery = `SELECT payment_amount, customer_id FROM ${TABLE_INFORMATION} WHERE id = ?`;
              const [paymentRows] = await db.execute(getPaymentQuery, [id]);
              const payment = paymentRows[0];

              // 2. Get bill_room details (total_price)
              const getBillRoomQuery = `SELECT total_price FROM bill_room_information WHERE id = ?`;
              const [billRoomRows] = await db.execute(getBillRoomQuery, [paymentData.payable_id]);

              if (billRoomRows.length > 0) {
                const billRoom = billRoomRows[0];
                const totalPrice = parseFloat(billRoom.total_price);
                const paymentAmount = parseFloat(payment.payment_amount);

                // 3. Check existing transactions
                const [existingTransactions] = await db.execute(
                  'SELECT COALESCE(SUM(transaction_amount), 0) as total_paid FROM bill_transaction_information WHERE bill_room_id = ? AND status != 2',
                  [paymentData.payable_id]
                );
                const totalPaid = parseFloat(existingTransactions[0].total_paid);
                const newTotalPaid = totalPaid + paymentAmount;

                // 4. Determine transaction type and bill_room status
                let transactionType = 'partial';
                let newBillRoomStatus = 4; // partial payment

                if (newTotalPaid >= totalPrice) {
                  transactionType = 'full';
                  newBillRoomStatus = 1; // paid
                }

                // 5. Insert transaction record
                // bill_transaction_type_id = NULL for system approved payments (payment_id is set)
                const insertTransactionQuery = `
                  INSERT INTO bill_transaction_information
                  (bill_room_id, payment_id, transaction_amount, bill_transaction_type_id, transaction_type_json, pay_date, transaction_type, remark, customer_id, status, create_by)
                  VALUES (?, ?, ?, NULL, NULL, NOW(), ?, ?, ?, 1, ?)
                `;
                await db.execute(insertTransactionQuery, [
                  paymentData.payable_id,
                  id,
                  paymentAmount,
                  transactionType,
                  remark?.trim() || null,
                  payment.customer_id,
                  uid
                ]);

                // 6. Update bill_room status
                const updateBillRoomQuery = `
                  UPDATE bill_room_information
                  SET status = ?, update_date = NOW(), update_by = ?
                  WHERE id = ? AND status != 2
                `;
                await db.execute(updateBillRoomQuery, [newBillRoomStatus, uid, paymentData.payable_id]);

                logger.info(`Approved payment id=${id}: Created transaction, updated bill_room_information id=${paymentData.payable_id} status=${newBillRoomStatus} (${transactionType} payment)`);
              }
            } catch (billRoomError) {
              logger.error(`Failed to process bill_room_information id=${paymentData.payable_id}:`, billRoomError);
              // ไม่ต้อง fail ทั้งหมด เพียงแค่ log error
            }
          }

          results.success.push({
            id: parseInt(id),
            status,
            remark: remark?.trim() || null
          });
        } else {
          results.failed.push({
            id: parseInt(id),
            reason: 'ไม่สามารถอัปเดตได้ (อาจมีการเปลี่ยนสถานะระหว่างการตรวจสอบ)'
          });
        }

      } catch (error) {
        results.failed.push({
          id: parseInt(id),
          reason: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `อัปเดตสำเร็จ ${results.success.length} รายการ${results.failed.length > 0 ? `, ล้มเหลว ${results.failed.length} รายการ` : ''}`,
      data: {
        total: ids.length,
        success_count: results.success.length,
        failed_count: results.failed.length,
        success_items: results.success,
        failed_items: results.failed,
        update_by: uid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Update payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update payment',
      message: error.message
    });
  }
};

export const getPaymentList = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, keyword, customer_id, amount_range, date_range } = req.query;

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

    let whereClause = 'WHERE p.status != 2';
    let queryParams = [];

    // Status filter
    if (status !== undefined) {
      whereClause += ' AND p.status = ?';
      queryParams.push(parseInt(status));
    }

    // Amount range filter
    if (amount_range !== undefined) {
      const amountRangeValue = parseInt(amount_range);
      if (amountRangeValue === 2) {
        // น้อยกว่า 1,000
        whereClause += ' AND p.payment_amount < 1000';
      } else if (amountRangeValue === 3) {
        // 1,000-3,000
        whereClause += ' AND p.payment_amount >= 1000 AND p.payment_amount <= 3000';
      } else if (amountRangeValue === 4) {
        // มากกว่า 3,000
        whereClause += ' AND p.payment_amount > 3000';
      }
      // amountRangeValue === 1 หรืออื่นๆ ไม่ทำอะไร (ทุกจำนวนเงิน)
    }

    // Date range filter
    if (date_range !== undefined) {
      const dateRangeValue = parseInt(date_range);
      if (dateRangeValue === 2) {
        // วันนี้
        whereClause += ' AND DATE(p.create_date) = CURDATE()';
      } else if (dateRangeValue === 3) {
        // 7 วันล่าสุด
        whereClause += ' AND p.create_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
      } else if (dateRangeValue === 4) {
        // เดือนนี้
        whereClause += ' AND YEAR(p.create_date) = YEAR(NOW()) AND MONTH(p.create_date) = MONTH(NOW())';
      }
      // dateRangeValue === 1 หรืออื่นๆ ไม่ทำอะไร (ทั้งหมด)
    }

    // Keyword search
    if (keyword && keyword.trim() !== '') {
      whereClause += ' AND (br.bill_no LIKE ? OR r.title LIKE ? OR m.full_name LIKE ? OR b.title LIKE ? OR br.house_no LIKE ?)';
      const searchTerm = `%${keyword.trim()}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Customer filter (required)
    whereClause += ' AND p.customer_id = ?';
    queryParams.push(customer_id);

    const countQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_INFORMATION} p
      LEFT JOIN member_information m ON p.member_id = m.id
      LEFT JOIN room_information r ON m.room_id = r.id
      LEFT JOIN bill_room_information br ON p.payable_type = 'bill_room_information' AND p.payable_id = br.id
      LEFT JOIN bill_information b ON br.bill_id = b.id
      ${whereClause}
    `;
    const [countResult] = await db.execute(countQuery, queryParams);
    const total = countResult[0].total;

    const dataQuery = `
      SELECT p.id, p.upload_key, p.payable_type, p.payable_id, p.payment_amount, p.payment_type_id, p.customer_id, p.status, p.member_id, p.remark,
             p.create_date, p.create_by, p.update_date, p.update_by, p.delete_date, p.delete_by,
             CONCAT(m.prefix_name, m.full_name) as member_name,
             m.full_name as member_real_name,
             CONCAT(r.title, ' | ', m.phone_number) as member_detail,
             br.bill_no, br.house_no, br.total_price as bill_total_price,
             b.title as bill_title,
             pt.title as payment_type_title, pt.detail as payment_type_detail
      FROM ${TABLE_INFORMATION} p
      LEFT JOIN member_information m ON p.member_id = m.id
      LEFT JOIN room_information r ON m.room_id = r.id
      LEFT JOIN bill_room_information br ON p.payable_type = 'bill_room_information' AND p.payable_id = br.id
      LEFT JOIN bill_information b ON br.bill_id = b.id
      LEFT JOIN payment_type_information pt ON p.payment_type_id = pt.id
      ${whereClause}
      ORDER BY p.create_date DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    const [rows] = await db.execute(dataQuery, queryParams);

    // Add formatted dates
    const formattedRows = addFormattedDatesToList(rows);

    // Format payment_amount with price formatter
    formattedRows.forEach(row => {
      if (row.payment_amount !== undefined && row.payment_amount !== null) {
        row.payment_amount = formatPrice(parseFloat(row.payment_amount));
      }
      if (row.bill_total_price !== undefined && row.bill_total_price !== null) {
        row.bill_total_price = formatPrice(parseFloat(row.bill_total_price));
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
    logger.error('List payment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payments',
      message: error.message
    });
  }
};

export const getPaymentSummaryStatus = async (req, res) => {
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

    // Tab 1: bill_room_information ที่ status = 0 (รอชำระ)
    const tab1Query = `
      SELECT COUNT(*) as total
      FROM bill_room_information br
      INNER JOIN bill_information b ON br.bill_id = b.id
      WHERE b.customer_id = ? AND br.status = 0
    `;
    const [tab1Result] = await db.execute(tab1Query, [customer_id]);
    const tab1 = tab1Result[0].total;

    // Tab 2, 3, 4: payment_information status
    const summaryQuery = `
      SELECT
        SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as tab2,
        SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as tab3,
        SUM(CASE WHEN status = 3 THEN 1 ELSE 0 END) as tab4
      FROM ${TABLE_INFORMATION}
      WHERE customer_id = ? AND status != 2
    `;

    const [rows] = await db.execute(summaryQuery, [customer_id]);

    res.json({
      success: true,
      data: {
        tab1,
        tab2: parseInt(rows[0].tab2) || 0,
        tab3: parseInt(rows[0].tab3) || 0,
        tab4: parseInt(rows[0].tab4) || 0
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Payment summary status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment summary',
      message: error.message
    });
  }
};

export const getPaymentDetail = async (req, res) => {
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

    const detailQuery = `
      SELECT p.id, p.upload_key, p.payable_type, p.payable_id, p.payment_amount, p.payment_type_id, p.customer_id, p.status, p.member_id, p.remark,
             p.create_date, p.create_by, p.update_date, p.update_by, p.delete_date, p.delete_by,
             CONCAT(m.prefix_name, m.full_name) as member_name,
             m.full_name as member_real_name,
             m.prefix_name,
             m.phone_number,
             m.email,
             r.title as member_detail,
             r.title as room_title,
             br.bill_no, br.house_no, br.total_price as bill_total_price,
             b.id as bill_id, b.title as bill_title, b.detail as bill_detail, b.bill_type_id, b.expire_date, b.send_date,
             bt.title as bill_type_title,
             pt.title as payment_type_title, pt.detail as payment_type_detail
      FROM ${TABLE_INFORMATION} p
      LEFT JOIN member_information m ON p.member_id = m.id
      LEFT JOIN room_information r ON m.room_id = r.id
      LEFT JOIN bill_room_information br ON p.payable_type = 'bill_room_information' AND p.payable_id = br.id
      LEFT JOIN bill_information b ON br.bill_id = b.id
      LEFT JOIN bill_type_information bt ON b.bill_type_id = bt.id
      LEFT JOIN payment_type_information pt ON p.payment_type_id = pt.id
      WHERE p.id = ? AND p.status != 2
    `;

    const [rows] = await db.execute(detailQuery, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found',
        message: 'ไม่พบข้อมูลการแจ้งชำระ'
      });
    }

    // Add formatted dates
    const formattedData = addFormattedDatesToList([rows[0]], ['create_date', 'update_date', 'delete_date', 'expire_date', 'send_date'])[0];

    // Format payment_amount and bill_total_price
    if (formattedData.payment_amount !== undefined && formattedData.payment_amount !== null) {
      formattedData.payment_amount = formatPrice(parseFloat(formattedData.payment_amount));
    }
    if (formattedData.bill_total_price !== undefined && formattedData.bill_total_price !== null) {
      formattedData.bill_total_price = formatPrice(parseFloat(formattedData.bill_total_price));
    }

    // Get latest payment attachment
    const attachmentQuery = `
      SELECT id, file_name, file_size, file_ext, file_path, create_date
      FROM payment_attachment
      WHERE upload_key = ? AND status != 2
      ORDER BY create_date DESC
      LIMIT 1
    `;
    const [attachmentRows] = await db.execute(attachmentQuery, [formattedData.upload_key]);

    // Format attachment with smart URL building
    let formattedAttachment = null;

    if (attachmentRows.length > 0) {
      const attachment = attachmentRows[0];
      formattedAttachment = {
        ...addFormattedDatesToList([attachment], ['create_date'])[0],
        file_path: getFileUrl(attachment.file_path)
      };
    }

    // Add attachment to response (only latest one)
    formattedData.attachment = formattedAttachment;

    res.json({
      success: true,
      data: formattedData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Payment detail error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment detail',
      message: error.message
    });
  }
};

export const getPaymentSummaryStatus2 = async (req, res) => {
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

    // Card 1: bill_room_information ที่ status = 0 (รอชำระ)
    const card1Query = `
      SELECT COUNT(*) as total
      FROM bill_room_information br
      INNER JOIN bill_information b ON br.bill_id = b.id
      WHERE b.customer_id = ? AND br.status = 0
    `;
    const [card1Result] = await db.execute(card1Query, [customer_id]);
    const card1 = card1Result[0].total;

    // Card 2: bill_room_information ที่ status = 0 และเลยวันครบกำหนด (expire_date < วันปัจจุบัน)
    const card2Query = `
      SELECT COUNT(*) as total
      FROM bill_room_information br
      INNER JOIN bill_information b ON br.bill_id = b.id
      WHERE b.customer_id = ? AND br.status = 0 AND b.expire_date < CURDATE()
    `;
    const [card2Result] = await db.execute(card2Query, [customer_id]);
    const card2 = card2Result[0].total;

    // Card 3: ยอดค้างรวม (total_price - total_paid) ของ bill_room_information ที่ status = 0 หรือ 4
    const card3Query = `
      SELECT
        br.id,
        br.total_price,
        COALESCE(SUM(bt.transaction_amount), 0) as total_paid
      FROM bill_room_information br
      INNER JOIN bill_information b ON br.bill_id = b.id
      LEFT JOIN bill_transaction_information bt ON br.id = bt.bill_room_id AND bt.status != 2
      WHERE b.customer_id = ? AND (br.status = 0 OR br.status = 4)
      GROUP BY br.id, br.total_price
    `;
    const [card3Result] = await db.execute(card3Query, [customer_id]);

    // คำนวณยอดค้างรวม (total_price - total_paid)
    let card3Total = 0;
    card3Result.forEach(row => {
      const totalPrice = parseFloat(row.total_price);
      const totalPaid = parseFloat(row.total_paid);
      const remaining = totalPrice - totalPaid;
      card3Total += remaining > 0 ? remaining : 0; // เอาเฉพาะยอดค้างที่เป็นบวก
    });

    const card3 = formatPrice(card3Total);

    res.json({
      success: true,
      data: {
        card1,
        card2,
        card3
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Payment summary status2 error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment summary status2',
      message: error.message
    });
  }
};

export const getPaymentSummaryData = async (req, res) => {
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

    // Get current month range (start and end of month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Card 1: บิลทั้งหมดเดือนนี้ (Total bill_room_information this month - status != 2)
    const totalBillRoomsQuery = `
      SELECT COUNT(*) as total
      FROM bill_room_information br
      INNER JOIN bill_information b ON br.bill_id = b.id
      WHERE b.customer_id = ? AND br.status != 2
    `;
    const [totalBillRoomsResult] = await db.execute(totalBillRoomsQuery, [customer_id]);
    const totalBillRooms = totalBillRoomsResult[0].total;

    // Card 1: บิลที่สร้างในเดือนนี้
    const billRoomsThisMonthQuery = `
      SELECT COUNT(*) as total
      FROM bill_room_information br
      INNER JOIN bill_information b ON br.bill_id = b.id
      WHERE b.customer_id = ? AND br.status != 2
        AND br.create_date >= ? AND br.create_date <= ?
    `;
    const [billRoomsThisMonthResult] = await db.execute(billRoomsThisMonthQuery, [customer_id, startOfMonth, endOfMonth]);
    const billRoomsThisMonth = billRoomsThisMonthResult[0].total;

    // Card 2: รอการอนุมัติ (payment_information.status = 0)
    const pendingPaymentQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_INFORMATION}
      WHERE customer_id = ? AND status = 0
    `;
    const [pendingPaymentResult] = await db.execute(pendingPaymentQuery, [customer_id]);
    const totalPendingPayment = pendingPaymentResult[0].total;

    // Card 2: รอการอนุมัติที่สร้างในเดือนนี้
    const pendingPaymentThisMonthQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_INFORMATION}
      WHERE customer_id = ? AND status = 0
        AND create_date >= ? AND create_date <= ?
    `;
    const [pendingPaymentThisMonthResult] = await db.execute(pendingPaymentThisMonthQuery, [customer_id, startOfMonth, endOfMonth]);
    const pendingPaymentThisMonth = pendingPaymentThisMonthResult[0].total;

    // Card 3: อนุมัติแล้ว (payment_information.status = 1)
    const approvedPaymentQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_INFORMATION}
      WHERE customer_id = ? AND status = 1
    `;
    const [approvedPaymentResult] = await db.execute(approvedPaymentQuery, [customer_id]);
    const totalApprovedPayment = approvedPaymentResult[0].total;

    // Card 3: อนุมัติในเดือนนี้
    const approvedPaymentThisMonthQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_INFORMATION}
      WHERE customer_id = ? AND status = 1
        AND update_date >= ? AND update_date <= ?
    `;
    const [approvedPaymentThisMonthResult] = await db.execute(approvedPaymentThisMonthQuery, [customer_id, startOfMonth, endOfMonth]);
    const approvedPaymentThisMonth = approvedPaymentThisMonthResult[0].total;

    // Card 4: ปฏิเสธ (payment_information.status = 3)
    const rejectedPaymentQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_INFORMATION}
      WHERE customer_id = ? AND status = 3
    `;
    const [rejectedPaymentResult] = await db.execute(rejectedPaymentQuery, [customer_id]);
    const totalRejectedPayment = rejectedPaymentResult[0].total;

    // Card 4: ปฏิเสธในเดือนนี้
    const rejectedPaymentThisMonthQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_INFORMATION}
      WHERE customer_id = ? AND status = 3
        AND update_date >= ? AND update_date <= ?
    `;
    const [rejectedPaymentThisMonthResult] = await db.execute(rejectedPaymentThisMonthQuery, [customer_id, startOfMonth, endOfMonth]);
    const rejectedPaymentThisMonth = rejectedPaymentThisMonthResult[0].total;

    // Card 5: รอชำระ (bill_room_information.status = 0)
    const unpaidBillRoomsQuery = `
      SELECT COUNT(*) as total
      FROM bill_room_information br
      INNER JOIN bill_information b ON br.bill_id = b.id
      WHERE b.customer_id = ? AND br.status = 0
    `;
    const [unpaidBillRoomsResult] = await db.execute(unpaidBillRoomsQuery, [customer_id]);
    const totalUnpaidBillRooms = unpaidBillRoomsResult[0].total;

    // Card 5: รอชำระที่สร้างในเดือนนี้
    const unpaidBillRoomsThisMonthQuery = `
      SELECT COUNT(*) as total
      FROM bill_room_information br
      INNER JOIN bill_information b ON br.bill_id = b.id
      WHERE b.customer_id = ? AND br.status = 0
        AND br.create_date >= ? AND br.create_date <= ?
    `;
    const [unpaidBillRoomsThisMonthResult] = await db.execute(unpaidBillRoomsThisMonthQuery, [customer_id, startOfMonth, endOfMonth]);
    const unpaidBillRoomsThisMonth = unpaidBillRoomsThisMonthResult[0].total;

    res.json({
      success: true,
      data: {
        total_bill_rooms: {
          count: totalBillRooms,
          change: billRoomsThisMonth,
          change_text: billRoomsThisMonth > 0 ? `+${billRoomsThisMonth} เดือนนี้` : `0 เดือนนี้`
        },
        pending_payment: {
          count: totalPendingPayment,
          change: pendingPaymentThisMonth,
          change_text: pendingPaymentThisMonth > 0 ? `+${pendingPaymentThisMonth} เดือนนี้` : `0 เดือนนี้`
        },
        approved_payment: {
          count: totalApprovedPayment,
          change: approvedPaymentThisMonth,
          change_text: approvedPaymentThisMonth > 0 ? `+${approvedPaymentThisMonth} เดือนนี้` : `0 เดือนนี้`
        },
        rejected_payment: {
          count: totalRejectedPayment,
          change: rejectedPaymentThisMonth,
          change_text: rejectedPaymentThisMonth > 0 ? `+${rejectedPaymentThisMonth} เดือนนี้` : `0 เดือนนี้`
        },
        unpaid_bill_rooms: {
          count: totalUnpaidBillRooms,
          change: unpaidBillRoomsThisMonth,
          change_text: unpaidBillRoomsThisMonth > 0 ? `+${unpaidBillRoomsThisMonth} เดือนนี้` : `0 เดือนนี้`
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get payment summary data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment summary data',
      message: error.message
    });
  }
};

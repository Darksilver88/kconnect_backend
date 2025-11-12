import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { addFormattedDates, addFormattedDatesToList } from '../utils/dateFormatter.js';
import { getFileUrl } from '../utils/storageManager.js';
import { getFirestore } from '../config/firebase.js';

const MENU = 'bill_room';
const TABLE_INFORMATION = `${MENU}_information`;

// Helper function to get master bank list from Firebase
async function getMasterBankListData() {
  try {
    const db = getFirestore();
    const docRef = db.collection('kconnect_config').doc('config').collection('niti_config').doc('config');
    const doc = await docRef.get();

    if (!doc.exists) {
      logger.warn('Master bank list not found in Firebase');
      return [];
    }

    const data = doc.data();
    return data.bank_list || [];
  } catch (error) {
    logger.error('Error fetching master bank list:', error);
    return [];
  }
}

// Helper function to enrich bank data with master bank info
function enrichBankWithMasterData(bank, masterBankList) {
  if (!bank.bank_id) {
    return bank;
  }

  const masterBank = masterBankList.find(b => b.id === bank.bank_id);

  if (masterBank) {
    return {
      ...bank,
      bank_name: masterBank.name,
      bank_icon: masterBank.icon
    };
  }

  return bank;
}

// Generate bill_no format: INV-YYYY-MMDD-NNN
async function generateBillNo(db, customer_id) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const datePrefix = `${month}${day}`;
  const pattern = `INV-${year}-${datePrefix}-%`;

  // Find the last bill_no with the same date pattern and customer_id
  const query = `
    SELECT bill_no
    FROM ${TABLE_INFORMATION}
    WHERE bill_no LIKE ? AND customer_id = ?
    ORDER BY bill_no DESC
    LIMIT 1
  `;

  const [rows] = await db.execute(query, [pattern, customer_id]);

  let runNumber = 0;

  if (rows.length > 0) {
    // Extract the run number from the last bill_no
    const lastBillNo = rows[0].bill_no;
    const parts = lastBillNo.split('-');
    if (parts.length === 4) {
      const lastRunNumber = parseInt(parts[3]);
      runNumber = (lastRunNumber + 1) % 1000; // Reset to 0 after 999
    }
  }

  const runNumberStr = String(runNumber).padStart(3, '0');
  return `INV-${year}-${datePrefix}-${runNumberStr}`;
}

export const insertBillRoom = async (req, res) => {
  try {
    const { bill_id, house_no, member_name, total_price, remark, customer_id, status, uid } = req.body;

    if (!bill_id || !house_no || !member_name || total_price === undefined || !customer_id || status === undefined || !uid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: bill_id, house_no, member_name, total_price, customer_id, status, uid',
        required: ['bill_id', 'house_no', 'member_name', 'total_price', 'customer_id', 'status', 'uid']
      });
    }

    const db = getDatabase();

    // Generate bill_no
    const billNo = await generateBillNo(db, customer_id);

    const insertQuery = `
      INSERT INTO ${TABLE_INFORMATION} (bill_id, bill_no, house_no, member_name, total_price, remark, customer_id, status, create_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const billIdValue = parseInt(bill_id);
    const totalPriceValue = parseFloat(total_price);

    const [result] = await db.execute(insertQuery, [
      billIdValue,
      billNo,
      house_no?.trim(),
      member_name?.trim(),
      totalPriceValue,
      remark?.trim() || null,
      customer_id?.trim(),
      status,
      uid
    ]);

    res.json({
      success: true,
      message: 'Bill room inserted successfully',
      data: {
        id: result.insertId,
        bill_id: billIdValue,
        bill_no: billNo,
        house_no,
        member_name,
        total_price: totalPriceValue,
        remark,
        customer_id,
        status,
        create_by: uid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Insert bill room error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to insert bill room',
      message: error.message
    });
  }
};

export const getBillRoomList = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, keyword, bill_id, customer_id } = req.query;

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

    let whereClause = 'WHERE status != 2';
    let queryParams = [];

    // Status filter
    if (status !== undefined && status !== '') {
      whereClause += ' AND status = ?';
      queryParams.push(parseInt(status));
    }

    // Keyword search (bill_no, house_no, member_name)
    if (keyword && keyword.trim() !== '') {
      whereClause += ' AND (bill_no LIKE ? OR house_no LIKE ? OR member_name LIKE ?)';
      const searchTerm = `%${keyword.trim()}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }

    // Bill ID filter
    if (bill_id !== undefined && bill_id !== '' && parseInt(bill_id) !== 0) {
      whereClause += ' AND bill_id = ?';
      queryParams.push(parseInt(bill_id));
    }

    // Customer filter (required)
    whereClause += ' AND customer_id = ?';
    queryParams.push(customer_id);

    const countQuery = `SELECT COUNT(*) as total FROM ${TABLE_INFORMATION} ${whereClause}`;
    const [countResult] = await db.execute(countQuery, queryParams);
    const total = countResult[0].total;

    const dataQuery = `
      SELECT *
      FROM ${TABLE_INFORMATION}
      ${whereClause}
      ORDER BY create_date DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    const [rows] = await db.execute(dataQuery, queryParams);

    // Add formatted dates
    const formattedRows = addFormattedDatesToList(rows);

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
    logger.error('List bill room error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bill rooms',
      message: error.message
    });
  }
};

/**
 * Get bill room list for mobile app
 * GET /api/bill_room/app_list
 */
export const getBillRoomAppList = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, keyword, bill_id, customer_id, house_no } = req.query;

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

    let whereClause = 'WHERE br.status != 2';
    let queryParams = [];

    // Status filter - support single or multiple values (e.g., "1" or "1,5")
    if (status !== undefined && status !== '') {
      const statusValues = status.toString().split(',').map(s => parseInt(s.trim())).filter(s => !isNaN(s));
      if (statusValues.length === 1) {
        whereClause += ' AND br.status = ?';
        queryParams.push(statusValues[0]);
      } else if (statusValues.length > 1) {
        const placeholders = statusValues.map(() => '?').join(',');
        whereClause += ` AND br.status IN (${placeholders})`;
        queryParams.push(...statusValues);
      }
    }

    // Keyword search (bill_no, house_no, member_name)
    if (keyword && keyword.trim() !== '') {
      whereClause += ' AND (br.bill_no LIKE ? OR br.house_no LIKE ? OR br.member_name LIKE ?)';
      const searchTerm = `%${keyword.trim()}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }

    // Bill ID filter
    if (bill_id !== undefined && bill_id !== '' && parseInt(bill_id) !== 0) {
      whereClause += ' AND br.bill_id = ?';
      queryParams.push(parseInt(bill_id));
    }

    // House number filter (for mobile app)
    if (house_no && house_no.trim() !== '') {
      whereClause += ' AND br.house_no = ?';
      queryParams.push(house_no.trim());
    }

    // Customer filter (required)
    whereClause += ' AND br.customer_id = ?';
    queryParams.push(customer_id);

    const countQuery = `SELECT COUNT(*) as total FROM ${TABLE_INFORMATION} br ${whereClause}`;
    const [countResult] = await db.execute(countQuery, queryParams);
    const total = countResult[0].total;

    const dataQuery = `
      SELECT
        br.id, br.bill_id, br.bill_no, br.house_no, br.member_name, br.total_price, br.remark, br.customer_id, br.status,
        br.create_date, br.create_by, br.update_date, br.update_by, br.delete_date, br.delete_by,
        b.title as bill_title, b.detail as bill_detail, b.expire_date
      FROM ${TABLE_INFORMATION} br
      LEFT JOIN bill_information b ON br.bill_id = b.id
      ${whereClause}
      ORDER BY br.create_date DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    const [rows] = await db.execute(dataQuery, queryParams);

    // Add formatted dates and additional fields
    const formattedRows = addFormattedDatesToList(rows, ['create_date', 'update_date', 'delete_date', 'expire_date']).map(row => {
      // Add total_price_formatted
      const totalPrice = parseFloat(row.total_price);
      row.total_price_formatted = `฿${formatNumber(totalPrice)}`;

      // Add status_formatted (no overdue check for list view)
      row.status_formatted = getStatusObject(row.status, false);

      // Add update_date_app_formatted (short format: "14 มิ.ย. 2025")
      row.update_date_app_formatted = formatDateForAppShort(row.update_date);

      // Add expire_date_app_formatted (short format: "14 มิ.ย. 2025")
      row.expire_date_app_formatted = formatDateForAppShort(row.expire_date);

      return row;
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
    logger.error('List bill room (app) error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bill rooms',
      message: error.message
    });
  }
};

/**
 * Get bill room detail by ID with transaction history
 * GET /api/bill_room/:id
 */
export const getBillRoomDetail = async (req, res) => {
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

    // Get bill_room details with bill information and bill_type
    const billRoomQuery = `
      SELECT
        br.id,
        br.bill_id,
        br.bill_no,
        br.house_no,
        br.member_name,
        br.total_price,
        br.remark,
        br.customer_id,
        br.status,
        br.create_date,
        br.create_by,
        br.update_date,
        br.update_by,
        br.delete_date,
        br.delete_by,
        b.title as bill_title,
        b.detail as bill_detail,
        b.expire_date,
        b.bill_type_id,
        bt.title as bill_type
      FROM ${TABLE_INFORMATION} br
      LEFT JOIN bill_information b ON br.bill_id = b.id
      LEFT JOIN bill_type_information bt ON b.bill_type_id = bt.id
      WHERE br.id = ? AND br.status != 2
    `;

    const [billRoomRows] = await db.execute(billRoomQuery, [parseInt(id)]);

    if (billRoomRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bill room not found',
        message: 'ไม่พบรายการบิลนี้'
      });
    }

    const row = billRoomRows[0];
    const billRoomData = addFormattedDates(row, ['create_date', 'update_date', 'delete_date', 'expire_date']);

    // Add total_price_formatted
    const totalPrice = parseFloat(row.total_price);
    billRoomData.total_price_formatted = `฿${formatNumber(totalPrice)}`;

    // Add create_date_app_detail_formatted (short format: "25 มิ.ย. 2025")
    billRoomData.create_date_app_detail_formatted = formatDateForAppShort(row.create_date);

    // Add expire_date_app_detail_formatted (short format: "15 ก.ค. 2025")
    billRoomData.expire_date_app_detail_formatted = formatDateForAppShort(row.expire_date);

    // Add remain_date
    billRoomData.remain_date = calculateRemainDays(row.expire_date);

    // Check if overdue for status_formatted
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expireDate = row.expire_date ? new Date(row.expire_date) : null;
    if (expireDate) {
      expireDate.setHours(0, 0, 0, 0);
    }
    const isOverdue = expireDate ? today > expireDate : false;

    // Add status_formatted (with overdue check)
    billRoomData.status_formatted = getStatusObject(row.status, isOverdue);

    // Get all transactions for this bill_room
    const transactionsQuery = `
      SELECT
        bt.id,
        bt.bill_room_id,
        bt.payment_id,
        bt.transaction_amount,
        bt.bill_transaction_type_id,
        bt.transaction_type_json,
        bt.pay_date,
        bt.transaction_date,
        bt.transaction_type,
        bt.remark,
        bt.status,
        bt.create_date,
        bt.create_by,
        btt.title as transaction_type_title
      FROM bill_transaction_information bt
      LEFT JOIN bill_transaction_type_information btt ON bt.bill_transaction_type_id = btt.id
      WHERE bt.bill_room_id = ? AND bt.status != 2
      ORDER BY bt.pay_date DESC, bt.create_date DESC
    `;

    const [transactionRows] = await db.execute(transactionsQuery, [parseInt(id)]);

    // Format transaction dates and parse JSON
    const formattedTransactions = transactionRows.map(tx => {
      const formatted = addFormattedDates(tx, ['pay_date', 'transaction_date', 'create_date']);

      // Parse transaction_type_json if exists
      if (formatted.transaction_type_json) {
        try {
          formatted.transaction_type_json_parsed = JSON.parse(formatted.transaction_type_json);
        } catch (error) {
          logger.warn(`Failed to parse transaction_type_json for transaction ${tx.id}`);
          formatted.transaction_type_json_parsed = null;
        }
      }

      return formatted;
    });

    // Calculate totals
    const totalPaid = transactionRows.reduce((sum, tx) => sum + parseFloat(tx.transaction_amount), 0);
    const billTotalPrice = parseFloat(billRoomData.total_price);
    const remainingAmount = billTotalPrice - totalPaid;

    // Get payment list for this bill_room
    const paymentListQuery = `
      SELECT
        p.id,
        p.member_id,
        p.status,
        p.create_date,
        p.update_date,
        p.payment_date,
        p.bank_id,
        p.payment_amount,
        p.payment_type_id,
        p.remark,
        p.upload_key,
        p.member_remark,
        m.full_name as member_name,
        m.house_no,
        pt.title as payment_type_title,
        pt.detail as payment_type_detail
      FROM payment_information p
      LEFT JOIN member_information m ON p.member_id = m.id
      LEFT JOIN payment_type_information pt ON p.payment_type_id = pt.id
      WHERE p.payable_type = 'bill_room_information'
        AND p.payable_id = ?
        AND p.status != 2
      ORDER BY p.update_date DESC
    `;

    const [paymentRows] = await db.execute(paymentListQuery, [parseInt(id)]);

    // If no payments, set paymentList to empty array
    let paymentList = [];

    if (paymentRows.length > 0) {
      // Get master bank list from Firebase
      const masterBankList = await getMasterBankListData();

      // Process payment list with attachments and bank data
      paymentList = await Promise.all(
        paymentRows.map(async (payment) => {
        // Format dates
        const formattedPayment = {
          id: payment.id,
          member_id: payment.member_id,
          status: payment.status,
          member_name: payment.member_name,
          house_no: payment.house_no,
          create_date: payment.create_date,
          update_date: payment.update_date,
          create_date_app_detail_formatted: `${formatDateDDMMYYYY(payment.create_date)?.split('/').slice(0, 2).join('/')}/${payment.create_date ? new Date(payment.create_date).getFullYear() : ''} ${payment.create_date ? String(new Date(payment.create_date).getHours()).padStart(2, '0') + ':' + String(new Date(payment.create_date).getMinutes()).padStart(2, '0') : ''}`,
          update_date_app_detail_formatted: `${formatDateDDMMYYYY(payment.update_date)?.split('/').slice(0, 2).join('/')}/${payment.update_date ? new Date(payment.update_date).getFullYear() : ''} ${payment.update_date ? String(new Date(payment.update_date).getHours()).padStart(2, '0') + ':' + String(new Date(payment.update_date).getMinutes()).padStart(2, '0') : ''}`,
          payment_date: payment.payment_date,
          payment_date_app_detail_formatted: payment.payment_date ? `${formatDateDDMMYYYY(payment.payment_date)?.split('/').slice(0, 2).join('/')}/${new Date(payment.payment_date).getFullYear()} ${String(new Date(payment.payment_date).getHours()).padStart(2, '0')}:${String(new Date(payment.payment_date).getMinutes()).padStart(2, '0')}` : null,
          bank_id: payment.bank_id,
          bank_data: null,
          payment_amount: `฿${formatNumber(parseFloat(payment.payment_amount))}`,
          payment_type_id: payment.payment_type_id,
          payment_type_data: {
            title: payment.payment_type_title,
            detail: payment.payment_type_detail
          },
          remark: payment.remark,
          member_remark: payment.member_remark,
          attachment: []
        };

        // Enrich bank data if bank_id exists
        if (payment.bank_id) {
          const bankData = enrichBankWithMasterData({ bank_id: payment.bank_id }, masterBankList);
          formattedPayment.bank_data = {
            bank_id: bankData.bank_id,
            bank_name: bankData.bank_name || null,
            bank_icon: bankData.bank_icon || null
          };
        }

        // Get attachments for this payment
        const attachmentQuery = `
          SELECT id, file_name, file_size, file_ext, file_path, create_date
          FROM payment_attachment
          WHERE upload_key = ? AND status != 2
          ORDER BY create_date DESC
        `;
        const [attachments] = await db.execute(attachmentQuery, [payment.upload_key]);

        // Format attachments with URL
        formattedPayment.attachment = attachments.map(att => ({
          ...addFormattedDates(att, ['create_date']),
          file_path: getFileUrl(att.file_path)
        }));

        return formattedPayment;
        })
      );
    }

    res.json({
      success: true,
      data: {
        ...billRoomData,
        transactions: formattedTransactions,
        payment_list: paymentList,
        summary: {
          total_price: billTotalPrice,
          total_paid: totalPaid,
          remaining_amount: remainingAmount,
          transaction_count: transactionRows.length,
          is_fully_paid: remainingAmount <= 0
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get bill room detail error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bill room detail',
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลรายละเอียดบิล',
      details: error.message
    });
  }
};

// Helper function to format number with commas
function formatNumber(num) {
  const parts = num.toFixed(2).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // Remove trailing zeros after decimal point
  if (parts[1] === '00') {
    return parts[0];
  }
  return parts.join('.');
}

// Helper function to get Thai month name
function getThaiMonthName(monthIndex) {
  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];
  return thaiMonths[monthIndex];
}

// Helper function to get Thai month name (short version)
function getThaiMonthNameShort(monthIndex) {
  const thaiMonthsShort = [
    'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
    'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
  ];
  return thaiMonthsShort[monthIndex];
}

// Helper function to format date for app (DD month_name YYYY+543)
function formatDateForApp(date) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;

  const day = d.getUTCDate();
  const month = getThaiMonthName(d.getUTCMonth());
  const year = d.getUTCFullYear() + 543;

  return `${day} ${month} ${year}`;
}

// Helper function to format date for app (short version: DD month_short YYYY)
function formatDateForAppShort(date) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;

  const day = d.getUTCDate();
  const month = getThaiMonthNameShort(d.getUTCMonth());
  const year = d.getUTCFullYear(); // ใช้ ค.ศ. ไม่บวก 543

  return `${day} ${month} ${year}`;
}

// Helper function to calculate remaining days
function calculateRemainDays(expireDate) {
  if (!expireDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expire = new Date(expireDate);
  expire.setHours(0, 0, 0, 0);

  const diffTime = expire - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return `เหลือ ${diffDays} วัน`;
  } else if (diffDays === 0) {
    return 'วันนี้';
  } else {
    return `เกิน ${Math.abs(diffDays)} วัน`;
  }
}

// Helper function to format date as DD/MM/YYYY
function formatDateDDMMYYYY(date) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;

  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();

  return `${day}/${month}/${year}`;
}

// Helper function to get status object
function getStatusObject(statusId, isOverdue = false) {
  // If status is 0 or 5 and overdue, change to status 3
  if ((statusId === 0 || statusId === 5) && isOverdue) {
    return {
      id: 3,
      text: 'เกินกำหนด',
      text_color: '#C0392B',
      background_color: '#FADBD8'
    };
  }

  const statusMap = {
    0: {
      id: 0,
      text: 'รอชำระ',
      text_color: '#D27500',
      background_color: '#FFECD5'
    },
    1: {
      id: 1,
      text: 'ชำระแล้ว',
      text_color: '#0F7D3E',
      background_color: '#D5F5E3'
    },
    3: {
      id: 3,
      text: 'เกินกำหนด',
      text_color: '#C0392B',
      background_color: '#FADBD8'
    },
    5: {
      id: 5,
      text: 'รอตรวจสอบ',
      text_color: '#0075FF',
      background_color: '#DAEBFF'
    }
  };

  return statusMap[statusId] || {
    id: statusId,
    text: 'ไม่ทราบสถานะ',
    text_color: '#000000',
    background_color: '#FFFFFF'
  };
}

/**
 * Get current bill room for mobile app
 * GET /api/bill_room/current_bill_room?house_no=xxx&customer_id=xxx
 * Returns the bill_room with status 0 or 5 with the earliest create_date
 */
export const getCurrentBillRoom = async (req, res) => {
  try {
    let { house_no, customer_id } = req.query;

    if (!house_no || !customer_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        message: 'กรุณาระบุ house_no และ customer_id',
        required: ['house_no', 'customer_id']
      });
    }

    // Convert house_no: replace "-" with "/" (e.g., "100-10" -> "100/10")
    house_no = house_no.replace(/-/g, '/');

    const db = getDatabase();

    // Get bill_room with bill information (including expire_date, title, detail, bill_type)
    const query = `
      SELECT
        br.id, br.bill_id, br.bill_no, br.house_no, br.member_name, br.total_price,
        br.remark, br.customer_id, br.status,
        br.create_date, br.create_by, br.update_date, br.update_by, br.delete_date, br.delete_by,
        b.expire_date, b.title as bill_title, b.detail as bill_detail, b.bill_type_id,
        bt.title as bill_type
      FROM ${TABLE_INFORMATION} br
      LEFT JOIN bill_information b ON br.bill_id = b.id
      LEFT JOIN bill_type_information bt ON b.bill_type_id = bt.id
      WHERE br.house_no = ? AND br.customer_id = ? AND br.status = 0 AND br.status != 2
      ORDER BY br.create_date ASC
      LIMIT 1
    `;

    const [rows] = await db.execute(query, [house_no, customer_id]);

    if (rows.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'ไม่พบบิลปัจจุบัน',
        timestamp: new Date().toISOString()
      });
    }

    const row = rows[0];

    // Check if there's a rejected payment (status = 3) for this bill_room
    const paymentQuery = `
      SELECT remark, update_date
      FROM payment_information
      WHERE payable_type = 'bill_room_information'
        AND payable_id = ?
        AND status = 3
      ORDER BY update_date DESC
      LIMIT 1
    `;
    const [paymentRows] = await db.execute(paymentQuery, [row.id]);
    const rejectedPayment = paymentRows.length > 0 ? paymentRows[0] : null;

    // Get last_bill_room (last paid bill with status=1, ordered by update_date DESC)
    const lastBillQuery = `
      SELECT total_price
      FROM ${TABLE_INFORMATION}
      WHERE house_no = ? AND customer_id = ? AND status = 1 AND status != 2
      ORDER BY update_date DESC
      LIMIT 1
    `;
    const [lastBillRows] = await db.execute(lastBillQuery, [house_no, customer_id]);
    const lastBillPrice = lastBillRows.length > 0 ? parseFloat(lastBillRows[0].total_price) : 0;

    // Get total_bill_room (count all bills for this house_no and customer_id)
    const totalCountQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_INFORMATION}
      WHERE house_no = ? AND customer_id = ? AND status != 2
    `;
    const [totalCountRows] = await db.execute(totalCountQuery, [house_no, customer_id]);
    const totalBillRoom = totalCountRows[0].total;

    // Add formatted dates
    const formattedData = addFormattedDates(row, ['create_date', 'update_date', 'delete_date', 'expire_date']);

    // Format total_price with comma and baht symbol
    const totalPrice = parseFloat(row.total_price);
    formattedData.total_price = `฿${formatNumber(totalPrice)}`;

    // Check if overdue
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expireDate = row.expire_date ? new Date(row.expire_date) : null;
    if (expireDate) {
      expireDate.setHours(0, 0, 0, 0);
    }
    const isOverdue = expireDate ? today > expireDate : false;

    // Replace status with object (with overdue check)
    formattedData.status = getStatusObject(row.status, isOverdue);

    // Add expire_date_app_formatted (long format with พ.ศ.)
    formattedData.expire_date_app_formatted = formatDateForApp(row.expire_date);

    // Add expire_date_app_detail_formatted (short format with ค.ศ.: "25 มิ.ย. 2025")
    formattedData.expire_date_app_detail_formatted = formatDateForAppShort(row.expire_date);

    // Add remain_date
    formattedData.remain_date = calculateRemainDays(row.expire_date);

    // Add create_date_app_formatted (short format: "25 มิ.ย. 2025")
    formattedData.create_date_app_formatted = formatDateForAppShort(row.create_date);

    // Add last_bill_room (formatted)
    formattedData.last_bill_room = lastBillPrice > 0 ? `฿${formatNumber(lastBillPrice)}` : '฿0';

    // Add total_bill_room (count)
    formattedData.total_bill_room = totalBillRoom;

    // Add rejected payment information if exists
    if (rejectedPayment) {
      formattedData.payment_update_date_formatted = formatDateDDMMYYYY(rejectedPayment.update_date);
      formattedData.remark = rejectedPayment.remark;
    }

    // Get latest payment for this bill_room (any status)
    const latestPaymentQuery = `
      SELECT id, remark, update_date
      FROM payment_information
      WHERE payable_type = 'bill_room_information'
        AND payable_id = ?
      ORDER BY update_date DESC
      LIMIT 1
    `;
    const [latestPaymentRows] = await db.execute(latestPaymentQuery, [row.id]);

    if (latestPaymentRows.length > 0) {
      const payment = latestPaymentRows[0];
      formattedData.payment_data = {
        id: payment.id,
        remark: payment.remark,
        update_date: payment.update_date,
        update_date_formatted: formatDateDDMMYYYY(payment.update_date)
      };
    } else {
      formattedData.payment_data = null;
    }

    res.json({
      success: true,
      data: formattedData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get current bill room error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch current bill room',
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลบิลปัจจุบัน',
      details: error.message
    });
  }
};

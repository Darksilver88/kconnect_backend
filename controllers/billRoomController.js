import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { addFormattedDates, addFormattedDatesToList } from '../utils/dateFormatter.js';
import { getFileUrl } from '../utils/storageManager.js';
import { getFirestore } from '../config/firebase.js';
import { getCustomerNameByCode } from '../utils/firebaseNotificationHelper.js';
import puppeteer from 'puppeteer';
import QRCode from 'qrcode';

const MENU = 'bill_room';
const TABLE_INFORMATION = `${MENU}_information`;

// Helper function to convert number to Thai text
function numberToThaiText(number) {
  const thaiNumbers = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const thaiUnits = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน', 'ล้าน'];

  if (number === 0) return 'ศูนย์บาทถ้วน';

  const [baht, satang] = number.toFixed(2).split('.');
  let result = '';

  // Convert baht
  const bahtNum = parseInt(baht);
  if (bahtNum > 0) {
    const bahtStr = bahtNum.toString();
    const len = bahtStr.length;

    for (let i = 0; i < len; i++) {
      const digit = parseInt(bahtStr[i]);
      const position = len - i - 1;

      if (digit === 0) continue;

      if (position === 1 && digit === 1) {
        result += 'สิบ';
      } else if (position === 1 && digit === 2) {
        result += 'ยี่สิบ';
      } else if (position === 0 && digit === 1 && len > 1) {
        result += 'เอ็ด';
      } else {
        result += thaiNumbers[digit] + thaiUnits[position];
      }
    }
    result += 'บาท';
  }

  // Convert satang
  const satangNum = parseInt(satang);
  if (satangNum > 0) {
    const satangStr = satangNum.toString().padStart(2, '0');
    const len = satangStr.length;

    for (let i = 0; i < len; i++) {
      const digit = parseInt(satangStr[i]);
      const position = len - i - 1;

      if (digit === 0) continue;

      if (position === 1 && digit === 1) {
        result += 'สิบ';
      } else if (position === 1 && digit === 2) {
        result += 'ยี่สิบ';
      } else if (position === 0 && digit === 1 && len > 1) {
        result += 'เอ็ด';
      } else {
        result += thaiNumbers[digit];
        if (position === 1) result += 'สิบ';
      }
    }
    result += 'สตางค์';
  } else {
    result += 'ถ้วน';
  }

  return result;
}

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

    // Bill information status filter (only sent bills: status = 1)
    whereClause += ' AND b.status = 1';

    const countQuery = `SELECT COUNT(*) as total FROM ${TABLE_INFORMATION} br INNER JOIN bill_information b ON br.bill_id = b.id ${whereClause}`;
    const [countResult] = await db.execute(countQuery, queryParams);
    const total = countResult[0].total;

    const dataQuery = `
      SELECT
        br.id, br.bill_id, br.bill_no, br.house_no, br.member_name, br.total_price, br.remark, br.customer_id, br.status,
        br.create_date, br.create_by, br.update_date, br.update_by, br.delete_date, br.delete_by,
        b.title as bill_title, b.detail as bill_detail, b.expire_date
      FROM ${TABLE_INFORMATION} br
      INNER JOIN bill_information b ON br.bill_id = b.id
      ${whereClause}
      ORDER BY b.expire_date DESC, br.id DESC
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

  const day = d.getDate();
  const month = getThaiMonthName(d.getMonth());
  const year = d.getFullYear() + 543;

  return `${day} ${month} ${year}`;
}

// Helper function to format date for app (short version: DD month_short YYYY)
function formatDateForAppShort(date) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;

  const day = d.getDate();
  const month = getThaiMonthNameShort(d.getMonth());
  const year = d.getFullYear(); // ใช้ ค.ศ. ไม่บวก 543

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

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

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
      WHERE br.house_no = ? AND br.customer_id = ? AND br.status = 0 AND br.status != 2 AND b.status = 1
      ORDER BY b.expire_date ASC, br.id ASC
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

/**
 * Get bill room history for mobile app
 * GET /api/bill_room/history?house_no=xxx&customer_id=xxx
 * Returns last_bill_room and total_bill_room
 */
export const getBillRoomHistory = async (req, res) => {
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

    // Get last_bill_room (last paid bill with status=1, ordered by update_date DESC)
    const lastBillQuery = `
      SELECT br.total_price
      FROM ${TABLE_INFORMATION} br
      INNER JOIN bill_information b ON br.bill_id = b.id
      WHERE br.house_no = ? AND br.customer_id = ? AND br.status = 1 AND br.status != 2 AND b.status = 1
      ORDER BY br.update_date DESC
      LIMIT 1
    `;
    const [lastBillRows] = await db.execute(lastBillQuery, [house_no, customer_id]);
    const lastBillPrice = lastBillRows.length > 0 ? parseFloat(lastBillRows[0].total_price) : 0;

    // Get total_bill_room (count all bills for this house_no and customer_id)
    const totalCountQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_INFORMATION} br
      INNER JOIN bill_information b ON br.bill_id = b.id
      WHERE br.house_no = ? AND br.customer_id = ? AND br.status != 2 AND b.status = 1
    `;
    const [totalCountRows] = await db.execute(totalCountQuery, [house_no, customer_id]);
    const totalBillRoom = totalCountRows[0].total;

    res.json({
      success: true,
      data: {
        last_bill_room: lastBillPrice > 0 ? `฿${formatNumber(lastBillPrice)}` : '฿0',
        total_bill_room: totalBillRoom
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get bill room history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bill room history',
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลประวัติบิล',
      details: error.message
    });
  }
};

/**
 * Get remain summary for mobile app
 * GET /api/bill_room/remain_summery?house_no=xxx&customer_id=xxx
 * Returns unpaid_amount, paid_amount, and difference
 */
export const getRemainSummery = async (req, res) => {
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

    // Get unpaid amount: sum of total_price where bill_room.status = 0 and bill.status = 1
    const unpaidQuery = `
      SELECT COALESCE(SUM(br.total_price), 0) as total
      FROM ${TABLE_INFORMATION} br
      INNER JOIN bill_information b ON br.bill_id = b.id
      WHERE br.house_no = ? AND br.customer_id = ? AND br.status = 0 AND b.status = 1 AND br.status != 2
    `;
    const [unpaidRows] = await db.execute(unpaidQuery, [house_no, customer_id]);
    const unpaidAmount = parseFloat(unpaidRows[0].total);

    // Get paid amount: sum of total_price where bill_room.status IN (1, 5) and bill.status = 1
    const paidQuery = `
      SELECT COALESCE(SUM(br.total_price), 0) as total
      FROM ${TABLE_INFORMATION} br
      INNER JOIN bill_information b ON br.bill_id = b.id
      WHERE br.house_no = ? AND br.customer_id = ? AND br.status IN (1, 5) AND b.status = 1 AND br.status != 2
    `;
    const [paidRows] = await db.execute(paidQuery, [house_no, customer_id]);
    const paidAmount = parseFloat(paidRows[0].total);

    // Get unpaid count: count of bill_room records where status = 0 and bill.status = 1
    const unpaidCountQuery = `
      SELECT COUNT(*) as count
      FROM ${TABLE_INFORMATION} br
      INNER JOIN bill_information b ON br.bill_id = b.id
      WHERE br.house_no = ? AND br.customer_id = ? AND br.status = 0 AND b.status = 1 AND br.status != 2
    `;
    const [unpaidCountRows] = await db.execute(unpaidCountQuery, [house_no, customer_id]);
    const unpaidCount = unpaidCountRows[0].count;

    res.json({
      success: true,
      data: {
        unpaid_amount: `฿${formatNumber(unpaidAmount)}`,
        paid_amount: `฿${formatNumber(paidAmount)}`,
        unpaid_count: unpaidCount
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get remain summery error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch remain summery',
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสรุปยอดคงเหลือ',
      details: error.message
    });
  }
};
/**
 * Get Invoice PDF
 * GET /api/bill_room/getInvoice?bill_room_id=1&customer_id=191
 */
export const getInvoice = async (req, res) => {
  try {
    const { bill_room_id, customer_id } = req.query;

    // Validate required parameters
    if (!bill_room_id || !customer_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        message: 'กรุณาระบุ bill_room_id และ customer_id',
        required: ['bill_room_id', 'customer_id']
      });
    }

    const db = getDatabase();

    // Query bill_room with bill information
    const query = `
      SELECT
        br.id,
        br.bill_id,
        br.bill_no,
        br.house_no,
        br.member_name,
        br.total_price,
        br.customer_id,
        br.create_date,
        b.title as bill_title,
        b.expire_date
      FROM bill_room_information br
      LEFT JOIN bill_information b ON br.bill_id = b.id
      WHERE br.id = ? AND br.customer_id = ? AND br.status != 2
    `;

    const [rows] = await db.execute(query, [bill_room_id, customer_id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bill room not found',
        message: 'ไม่พบข้อมูลบิล'
      });
    }

    const billRoom = rows[0];

    // Get customer name from Firebase
    const customerName = await getCustomerNameByCode(customer_id);
    const companyName = customerName ? `นิติบุคคล${customerName}` : 'นิติบุคคล';

    // Get customer address from app_customer_config
    // Query customer configs from app_customer_config
    const configQuery = `
      SELECT config_key, config_value
      FROM app_customer_config
      WHERE config_key IN ('customer_address', 'customer_phone1', 'customer_phone2', 'customer_email')
        AND customer_id = ?
        AND is_active = 1
    `;
    const [configRows] = await db.execute(configQuery, [customer_id]);

    // Extract config values
    const customerAddress = configRows.find(row => row.config_key === 'customer_address')?.config_value || null;
    const customerPhone1 = configRows.find(row => row.config_key === 'customer_phone1')?.config_value || null;
    const customerPhone2 = configRows.find(row => row.config_key === 'customer_phone2')?.config_value || null;
    const customerEmail = configRows.find(row => row.config_key === 'customer_email')?.config_value || null;

    // Build phone display text
    let phoneText = '';
    if (customerPhone1) {
      phoneText = customerPhone1;
      if (customerPhone2) {
        phoneText += ',' + customerPhone2;
      }
    } else if (customerPhone2) {
      phoneText = customerPhone2;
    }
    if (!phoneText) phoneText = '-';

    // Format dates (ค.ศ.)
    const createDate = new Date(billRoom.create_date);
    const expireDate = new Date(billRoom.expire_date);

    const createDateFormatted = `${String(createDate.getUTCDate()).padStart(2, '0')}/${String(createDate.getUTCMonth() + 1).padStart(2, '0')}/${createDate.getUTCFullYear()}`;
    const expireDateFormatted = `${String(expireDate.getUTCDate()).padStart(2, '0')}/${String(expireDate.getUTCMonth() + 1).padStart(2, '0')}/${expireDate.getUTCFullYear()}`;

    // Format total price
    const totalPrice = parseFloat(billRoom.total_price);
    const totalPriceFormatted = totalPrice.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    // Convert to Thai text
    const totalPriceThaiText = numberToThaiText(totalPrice);

    // Generate QR Code for app download
    const qrCodeData = await QRCode.toDataURL('https://onelink.to/q45d3c', {
      width: 80,
      margin: 1
    });

    const html = `<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ใบแจ้งค่าใช้จ่าย / Invoice</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Sarabun', 'Tahoma', sans-serif;
            padding: 0;
            margin: 0;
            background-color: white;
        }

        .invoice-container {
            max-width: 100%;
            margin: 0;
            background-color: white;
            padding: 40px;
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 20px;
        }

        .company-info h1 {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 8px;
        }

        .company-info p {
            font-size: 11px;
            line-height: 1.4;
        }

        .invoice-title {
            font-size: 14px;
            font-weight: bold;
        }

        .customer-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin-bottom: 20px;
            font-size: 11px;
        }

        .customer-info-left {
            display: grid;
            grid-template-columns: auto 1fr;
            gap: 8px;
        }

        .customer-info-right {
            display: grid;
            grid-template-columns: auto auto;
            gap: 8px 15px;
            justify-content: end;
        }

        .customer-info .label {
            font-weight: normal;
        }

        .customer-info .value {
            font-weight: normal;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
        }

        table, th, td {
            border: 1px solid #000;
        }

        th {
            background-color: white;
            padding: 8px;
            text-align: center;
            font-size: 11px;
            font-weight: normal;
            vertical-align: middle;
        }

        td {
            padding: 8px;
            font-size: 11px;
        }

        .description-col {
            text-align: left;
        }

        .amount-col {
            text-align: right;
        }

        .item-row td {
            height: 200px;
            vertical-align: top;
        }

        .summary-section {
            text-align: right;
            font-size: 11px;
        }

        .summary-row {
            display: flex;
            justify-content: flex-end;
            padding: 5px 10px;
        }

        .summary-label {
            width: 250px;
            text-align: right;
            padding-right: 20px;
        }

        .summary-value {
            width: 150px;
            text-align: right;
        }

        .note-payment-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-top: 15px;
        }

        .note-section {
            font-size: 10px;
            line-height: 1.4;
        }

        .note-section p {
            margin-bottom: 3px;
        }

        .payment-notice {
            font-size: 11px;
            font-weight: bold;
            text-align: left;
        }

        .payment-notice p {
            margin-bottom: 3px;
        }

        .qr-section {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-top: 20px;
        }

        .qr-text p {
            font-size: 10px;
            line-height: 1.4;
        }

        .qr-text p:first-child {
            font-weight: bold;
            margin-bottom: 3px;
        }
    </style>
</head>
<body>
    <div class="invoice-container">
        <!-- Header -->
        <div class="header">
            <div class="company-info">
                <h1>${companyName}</h1>
                <p>${customerAddress || '-'}</p>
                <p>Tax ID - โทร: ${phoneText} Email: ${customerEmail || '-'}</p>
            </div>
            <div class="invoice-title">
                ใบแจ้งค่าใช้จ่าย / Invoice
            </div>
        </div>

        <!-- Customer Information -->
        <div class="customer-info">
            <!-- Left Column -->
            <div class="customer-info-left">
                <div class="label">ชื่อ / ATTN</div>
                <div class="value">${billRoom.member_name}</div>

                <div class="label">ที่อยู่ / Address</div>
                <div class="value">${billRoom.house_no}${customerAddress ? ' ' + customerAddress : ''}</div>
            </div>

            <!-- Right Column -->
            <div class="customer-info-right">
                <div class="label">เลขที่ / No.</div>
                <div class="value">${billRoom.bill_no}</div>

                <div class="label">วันที่ / Date</div>
                <div class="value">${createDateFormatted}</div>

                <div class="label">บ้านเลขที่ / Room No</div>
                <div class="value">${billRoom.house_no}</div>
            </div>
        </div>

        <!-- Items Table -->
        <table>
            <thead>
                <tr>
                    <th class="description-col">รายการ<br>Description</th>
                    <th class="amount-col">จำนวนเงิน<br>Amount (Baht)</th>
                </tr>
            </thead>
            <tbody>
                <tr class="item-row">
                    <td class="description-col">${billRoom.bill_title}</td>
                    <td class="amount-col">${totalPriceFormatted}</td>
                </tr>
                <!-- Summary Rows -->
                <tr>
                    <td class="description-col" style="text-align: right; border-bottom: none;">รวมเงิน / Total</td>
                    <td class="amount-col" style="border-bottom: none;">${totalPriceFormatted}</td>
                </tr>
                <tr>
                    <td class="description-col" style="border-top: none; border-bottom: none; padding: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span>( ${totalPriceThaiText} )</span>
                            <span>ยอดค้างชำระ / Outstanding Balance</span>
                        </div>
                    </td>
                    <td class="amount-col" style="border-top: none; border-bottom: none;">0.00</td>
                </tr>
                <tr>
                    <td class="description-col" style="text-align: right; border-top: none;">รวมเงินทั้งสิ้น / Grand Total</td>
                    <td class="amount-col" style="border-top: none;">${totalPriceFormatted}</td>
                </tr>
            </tbody>
        </table>

        <!-- Payment Due Date -->
        <p style="font-size: 11px; margin-top: 15px; font-weight: bold;">โปรดชำระค่าใช้จ่ายนี้เรียกเก็บภายในวันที่ ${expireDateFormatted}</p>

        <!-- Notes and Payment Notice Section -->
        <div class="note-payment-section">
            <!-- Notes - Left Column -->
            <div class="note-section">
                <p>1.หากมีข้อสงสัยประการใด กรุณาติดต่อนิติบุคคล</p>
                <p>2.กรุณาขอรับใบเสร็จทุกครั้งที่มีการชำระเงิน</p>
                <p>3.เอกสารฉบับนี้ไม่สามารถใช้แทนใบเสร็จรับเงินได้</p>
                <p>4.กรณีลูกค้าชำระค่าใช้จ่าย ระบบจะนำไปตัดหนี้เก่าที่ค้างชำระอยู่ก่อนเสมอ (รวมเงินเพิ่ม)</p>
                <p>5.กรณีชำระไม่ตรงตามยอดในใบแจ้งหนี้ ระบบจะตัดตามยอดที่ลูกค้าชำระจริง</p>
                <p>6.กรณีชำระเกินกำหนดการชำระเงินตามข้อบังคับ ท่านจะต้องเสียเงินเพิ่มในยอดใบแจ้งหนี้ถัดไป</p>
            </div>

            <!-- Payment Notice - Right Column -->
            <div class="payment-notice">
                <p>กรณีชำระค่าใช้จ่ายเกินกำหนดตามข้อบังคับมีเงินเพิ่มรายวัน</p>
                <p>จากการชำระล่าช้าหลังวันออกใบแจ้งหนี้</p>
            </div>
        </div>

        <!-- QR Code Section -->
        <div class="qr-section">
            <img src="${qrCodeData}" width="80" height="80" style="border: none;" />
            <div class="qr-text">
                <p><strong>Scan QR เพื่อดาวน์โหลด KConnect Application</strong></p>
                <p>สะดวกสบายในเรื่องการดูค่าใช้จ่าย และ ดูโบะเสรีจำเนิน</p>
            </div>
        </div>
    </div>
</body>
</html>`;

    // Launch Puppeteer and generate PDF
    logger.debug('Launching Puppeteer...');
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });

    logger.debug('Creating new page...');
    const page = await browser.newPage();

    logger.debug('Setting HTML content...');
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    logger.debug('Generating PDF...');
    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: false,
      margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
      }
    });

    logger.debug('Closing browser...');
    await browser.close();

    logger.debug(`PDF buffer size: ${pdfBuffer.length} bytes`);

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const fileName = `invoice_${timestamp}.pdf`;

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send PDF as binary
    res.end(pdfBuffer, 'binary');

    logger.info(`Invoice PDF generated: ${fileName}`);

  } catch (error) {
    logger.error('Get invoice error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate invoice PDF',
      message: error.message
    });
  }
};

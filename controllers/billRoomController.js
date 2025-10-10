import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { addFormattedDatesToList } from '../utils/dateFormatter.js';

const MENU = 'bill_room';
const TABLE_INFORMATION = `${MENU}_information`;

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
    if (status !== undefined) {
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
      SELECT id, bill_id, bill_no, house_no, member_name, total_price, remark, customer_id, status,
             create_date, create_by, update_date, update_by, delete_date, delete_by
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

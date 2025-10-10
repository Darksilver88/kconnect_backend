import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { addFormattedDates, addFormattedDatesToList } from '../utils/dateFormatter.js';
import xlsx from 'xlsx';
import fs from 'fs';

const MENU = 'bill';
const TABLE_INFORMATION = `${MENU}_information`;

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

    // Set send_date to current date if status is 1
    const sendDate = parseInt(status) === 1 ? new Date() : null;

    const insertQuery = `
      INSERT INTO ${TABLE_INFORMATION} (upload_key, title, bill_type_id, detail, expire_date, send_date, remark, customer_id, status, create_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const billTypeIdValue = parseInt(bill_type_id);

    const [result] = await db.execute(insertQuery, [
      upload_key?.trim(),
      title?.trim(),
      billTypeIdValue,
      detail?.trim(),
      expire_date,
      sendDate,
      remark?.trim() || null,
      customer_id?.trim(),
      status,
      uid
    ]);

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
        send_date: sendDate,
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
    const { id, title, detail, expire_date, status, remark, uid } = req.body;

    if (!id || !title || !detail || !expire_date || status === undefined || !uid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: id, title, detail, expire_date, status, uid',
        required: ['id', 'title', 'detail', 'expire_date', 'status', 'uid']
      });
    }

    const db = getDatabase();

    // Check current status to determine if we need to set send_date
    const checkQuery = `SELECT status, send_date FROM ${TABLE_INFORMATION} WHERE id = ? AND status != 2`;
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

    // Set send_date to current date if status is changing to 1 and send_date is null
    let sendDateUpdate = '';
    let queryParams = [];

    if (parseInt(status) === 1 && currentSendDate === null) {
      sendDateUpdate = ', send_date = NOW()';
    }

    const updateQuery = `
      UPDATE ${TABLE_INFORMATION}
      SET title = ?, detail = ?, expire_date = ?, remark = ?, status = ?${sendDateUpdate}, update_date = NOW(), update_by = ?
      WHERE id = ? AND status != 2
    `;

    queryParams = [
      title?.trim(),
      detail?.trim(),
      expire_date,
      remark?.trim() || null,
      status,
      uid,
      id
    ];

    const [result] = await db.execute(updateQuery, queryParams);

    res.json({
      success: true,
      message: 'Bill updated successfully',
      data: {
        id: parseInt(id),
        title,
        detail,
        expire_date,
        remark,
        status,
        send_date_updated: parseInt(status) === 1 && currentSendDate === null,
        update_by: uid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Update bill error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update bill',
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

    const query = `
      SELECT b.id, b.upload_key, b.title, b.bill_type_id, b.detail, b.expire_date, b.send_date, b.remark, b.customer_id, b.status,
             b.create_date, b.create_by, b.update_date, b.update_by, b.delete_date, b.delete_by,
             bt.title as bill_type_title
      FROM ${TABLE_INFORMATION} b
      LEFT JOIN bill_type_information bt ON b.bill_type_id = bt.id
      WHERE b.id = ? AND b.status != 2
    `;

    const [rows] = await db.execute(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bill not found',
        message: 'ไม่พบข้อมูลบิล'
      });
    }

    // Add formatted dates (including expire_date and send_date)
    const formattedData = addFormattedDates(rows[0], ['create_date', 'update_date', 'delete_date', 'expire_date', 'send_date']);

    res.json({
      success: true,
      data: formattedData,
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
    const { upload_key, title, bill_type_id, detail, expire_date, customer_id, status, uid } = req.body;

    // Validate required fields
    if (!upload_key || !title || !bill_type_id || !detail || !expire_date || !customer_id || status === undefined || !uid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: upload_key, title, bill_type_id, detail, expire_date, customer_id, status, uid',
        required: ['upload_key', 'title', 'bill_type_id', 'detail', 'expire_date', 'customer_id', 'status', 'uid']
      });
    }

    const db = getDatabase();

    // Step 1: Query Excel file from bill_attachment
    const attachmentQuery = `
      SELECT file_path, file_name, file_ext
      FROM bill_attachment
      WHERE upload_key = ? AND status != 2
      ORDER BY create_date DESC
      LIMIT 1
    `;

    const [attachments] = await db.execute(attachmentQuery, [upload_key?.trim()]);

    if (attachments.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Excel file not found',
        message: 'ไม่พบไฟล์ Excel ที่ upload_key นี้'
      });
    }

    const attachment = attachments[0];
    const filePath = attachment.file_path;
    const fileExt = attachment.file_ext.toLowerCase();

    // Step 2: Validate file extension
    if (fileExt !== 'xlsx' && fileExt !== 'xls') {
      return res.status(400).json({
        success: false,
        error: 'Invalid file type',
        message: 'ไฟล์ต้องเป็น Excel (.xlsx หรือ .xls) เท่านั้น'
      });
    }

    // Step 3: Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'File not found on server',
        message: 'ไม่พบไฟล์บนเซิร์ฟเวอร์'
      });
    }

    // Step 4: Read and parse Excel file
    let workbook;
    try {
      workbook = xlsx.readFile(filePath);
    } catch (error) {
      logger.error('Error reading Excel file:', error);
      return res.status(400).json({
        success: false,
        error: 'Failed to read Excel file',
        message: 'ไม่สามารถอ่านไฟล์ Excel ได้ ไฟล์อาจเสียหาย'
      });
    }

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    // Step 5: Validate Excel data
    if (!data || data.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Excel file is empty',
        message: 'ไฟล์ Excel ไม่มีข้อมูล'
      });
    }

    // Validate column headers
    const requiredColumns = ['เลขที่ห้อง', 'ชื่อลูกบ้าน', 'ยอดเงิน'];
    const firstRow = data[0];
    const missingColumns = requiredColumns.filter(col => !(col in firstRow));

    if (missingColumns.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required columns',
        message: `ไฟล์ Excel ต้องมี columns: ${missingColumns.join(', ')}`,
        missing_columns: missingColumns
      });
    }

    // Validate each row
    const validatedRows = [];
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2; // Excel row number (header is row 1)

      const houseNo = row['เลขที่ห้อง']?.toString().trim();
      const memberName = row['ชื่อลูกบ้าน']?.toString().trim();
      const totalPrice = parseFloat(row['ยอดเงิน']);

      // Validate row data
      if (!houseNo) {
        errors.push(`แถว ${rowNum}: ไม่มีเลขที่ห้อง`);
        continue;
      }

      if (!memberName) {
        errors.push(`แถว ${rowNum}: ไม่มีชื่อลูกบ้าน`);
        continue;
      }

      if (isNaN(totalPrice)) {
        errors.push(`แถว ${rowNum}: ยอดเงินต้องเป็นตัวเลข`);
        continue;
      }

      validatedRows.push({
        house_no: houseNo,
        member_name: memberName,
        total_price: totalPrice
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Excel validation failed',
        message: 'พบข้อผิดพลาดในไฟล์ Excel',
        errors: errors
      });
    }

    if (validatedRows.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid data',
        message: 'ไม่มีข้อมูลที่ถูกต้องในไฟล์ Excel'
      });
    }

    // Step 6: Start Transaction
    await db.execute('START TRANSACTION');

    try {
      // Step 7: Insert bill_information
      const sendDate = parseInt(status) === 1 ? new Date() : null;

      const billInsertQuery = `
        INSERT INTO ${TABLE_INFORMATION} (upload_key, title, bill_type_id, detail, expire_date, send_date, customer_id, status, create_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const billTypeIdValue = parseInt(bill_type_id);

      const [billResult] = await db.execute(billInsertQuery, [
        upload_key?.trim(),
        title?.trim(),
        billTypeIdValue,
        detail?.trim(),
        expire_date,
        sendDate,
        customer_id?.trim(),
        status,
        uid
      ]);

      const billId = billResult.insertId;

      // Step 8: Generate initial bill_no
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const datePrefix = `${month}${day}`;
      const pattern = `INV-${year}-${datePrefix}-%`;

      const lastBillNoQuery = `
        SELECT bill_no
        FROM bill_room_information
        WHERE bill_no LIKE ? AND customer_id = ?
        ORDER BY bill_no DESC
        LIMIT 1
      `;

      const [lastRows] = await db.execute(lastBillNoQuery, [pattern, customer_id?.trim()]);

      let runNumber = 0;

      if (lastRows.length > 0) {
        const lastBillNo = lastRows[0].bill_no;
        const parts = lastBillNo.split('-');
        if (parts.length === 4) {
          const lastRunNumber = parseInt(parts[3]);
          runNumber = (lastRunNumber + 1) % 1000;
        }
      }

      // Step 9: Batch INSERT bill_room_information
      const billRoomValues = [];
      const billRoomParams = [];

      for (let i = 0; i < validatedRows.length; i++) {
        const rowData = validatedRows[i];
        const currentRunNumber = (runNumber + i) % 1000;
        const billNo = `INV-${year}-${datePrefix}-${String(currentRunNumber).padStart(3, '0')}`;

        billRoomValues.push('(?, ?, ?, ?, ?, ?, ?, ?)');
        billRoomParams.push(
          billId,
          billNo,
          rowData.house_no,
          rowData.member_name,
          rowData.total_price,
          customer_id?.trim(),
          0, // status = 0
          -1  // create_by = -1
        );
      }

      const billRoomInsertQuery = `
        INSERT INTO bill_room_information (bill_id, bill_no, house_no, member_name, total_price, customer_id, status, create_by)
        VALUES ${billRoomValues.join(', ')}
      `;

      await db.execute(billRoomInsertQuery, billRoomParams);

      // Step 10: Commit Transaction
      await db.execute('COMMIT');

      res.json({
        success: true,
        message: 'Bill and bill rooms inserted successfully',
        data: {
          bill_id: billId,
          total_rooms_inserted: validatedRows.length,
          upload_key,
          title,
          customer_id
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      // Rollback on error
      await db.execute('ROLLBACK');
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

    // Keyword search (title, detail)
    if (keyword && keyword.trim() !== '') {
      whereClause += ' AND (b.title LIKE ? OR b.detail LIKE ?)';
      const searchTerm = `%${keyword.trim()}%`;
      queryParams.push(searchTerm, searchTerm);
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
      SELECT b.id, b.upload_key, b.title, b.bill_type_id, b.detail, b.expire_date, b.send_date, b.remark, b.customer_id, b.status,
             b.create_date, b.create_by, b.update_date, b.update_by, b.delete_date, b.delete_by,
             bt.title as bill_type_title
      FROM ${TABLE_INFORMATION} b
      LEFT JOIN bill_type_information bt ON b.bill_type_id = bt.id
      ${whereClause}
      ORDER BY b.create_date DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    const [rows] = await db.execute(dataQuery, queryParams);

    // Add formatted dates (including expire_date and send_date)
    const formattedRows = addFormattedDatesToList(rows, ['create_date', 'update_date', 'delete_date', 'expire_date', 'send_date']);

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

import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { addFormattedDatesToList } from '../utils/dateFormatter.js';

const MENU = 'room';
const TABLE_INFORMATION = `${MENU}_information`;

export const insertRoom = async (req, res) => {
  try {
    const { title, upload_key, type_id, customer_id, owner_id, status, uid } = req.body;

    if (!title || !upload_key || !customer_id || !owner_id || status === undefined || !uid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: title, upload_key, customer_id, owner_id, status, uid',
        required: ['title', 'upload_key', 'customer_id', 'owner_id', 'status', 'uid']
      });
    }

    const db = getDatabase();

    const insertQuery = `
      INSERT INTO ${TABLE_INFORMATION} (upload_key, title, type_id, customer_id, owner_id, status, create_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const typeIdValue = type_id ? parseInt(type_id) : null;
    const ownerIdValue = parseInt(owner_id);

    const [result] = await db.execute(insertQuery, [
      upload_key,
      title,
      typeIdValue,
      customer_id,
      ownerIdValue,
      status,
      uid
    ]);

    res.json({
      success: true,
      message: 'Room inserted successfully',
      data: {
        id: result.insertId,
        upload_key,
        title,
        type_id: typeIdValue,
        customer_id: customer_id,
        owner_id: ownerIdValue,
        status,
        create_by: uid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Insert room error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to insert room',
      message: error.message
    });
  }
};

export const getRoomList = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, keyword, type_id, customer_id, owner_id } = req.query;

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

    // Keyword search (title)
    if (keyword && keyword.trim() !== '') {
      whereClause += ' AND title LIKE ?';
      const searchTerm = `%${keyword.trim()}%`;
      queryParams.push(searchTerm);
    }

    // Type filter
    if (type_id !== undefined && type_id !== '' && parseInt(type_id) !== 0) {
      whereClause += ' AND type_id = ?';
      queryParams.push(parseInt(type_id));
    }

    // Customer filter (required)
    whereClause += ' AND customer_id = ?';
    queryParams.push(customer_id);

    // Owner filter
    if (owner_id !== undefined && owner_id !== '' && parseInt(owner_id) !== 0) {
      whereClause += ' AND owner_id = ?';
      queryParams.push(parseInt(owner_id));
    }

    const countQuery = `SELECT COUNT(*) as total FROM ${TABLE_INFORMATION} ${whereClause}`;
    const [countResult] = await db.execute(countQuery, queryParams);
    const total = countResult[0].total;

    const dataQuery = `
      SELECT id, upload_key, title, type_id, customer_id, owner_id, status,
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
    logger.error('List room error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch rooms',
      message: error.message
    });
  }
};

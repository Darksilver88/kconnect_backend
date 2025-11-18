import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { addFormattedDates, addFormattedDatesToList } from '../utils/dateFormatter.js';

const MENU = 'member';
const TABLE_INFORMATION = `${MENU}_information`;

export const insertMember = async (req, res) => {
  try {
    const { upload_key, prefix_name, full_name, phone_number, email, enter_date, room_id, house_no, user_level, user_type, user_ref, member_ref, customer_id, status, uid } = req.body;

    if (!upload_key || !prefix_name || !full_name || !phone_number || !email || !enter_date || !room_id || !house_no || !user_level || !user_type || !user_ref || !member_ref || !customer_id || status === undefined || !uid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: upload_key, prefix_name, full_name, phone_number, email, enter_date, room_id, house_no, user_level, user_type, user_ref, member_ref, customer_id, status, uid',
        required: ['upload_key', 'prefix_name', 'full_name', 'phone_number', 'email', 'enter_date', 'room_id', 'house_no', 'user_level', 'user_type', 'user_ref', 'member_ref', 'customer_id', 'status', 'uid']
      });
    }

    const db = getDatabase();

    const insertQuery = `
      INSERT INTO ${TABLE_INFORMATION} (upload_key, prefix_name, full_name, phone_number, email, enter_date, room_id, house_no, user_level, user_type, user_ref, member_ref, customer_id, status, create_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const roomIdValue = parseInt(room_id);

    const [result] = await db.execute(insertQuery, [
      upload_key?.trim(),
      prefix_name?.trim(),
      full_name?.trim(),
      phone_number?.trim(),
      email?.trim(),
      enter_date,
      roomIdValue,
      house_no?.trim(),
      user_level?.trim(),
      user_type?.trim(),
      user_ref?.trim(),
      member_ref?.trim(),
      customer_id?.trim(),
      status,
      uid
    ]);

    res.json({
      success: true,
      message: 'Member inserted successfully',
      data: {
        id: result.insertId,
        upload_key,
        prefix_name,
        full_name,
        phone_number,
        email,
        enter_date,
        room_id: roomIdValue,
        house_no,
        user_level,
        user_type,
        user_ref,
        member_ref,
        customer_id,
        status,
        create_by: uid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Insert member error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to insert member',
      message: error.message
    });
  }
};

export const getMemberDetail = async (req, res) => {
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
      SELECT id, upload_key, prefix_name, full_name, phone_number, email, enter_date, room_id, house_no, user_level, user_type, user_ref, member_ref, customer_id, status,
             create_date, create_by, update_date, update_by, delete_date, delete_by
      FROM ${TABLE_INFORMATION}
      WHERE id = ? AND status != 2
    `;

    const [rows] = await db.execute(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Member not found',
        message: 'ไม่พบข้อมูลสมาชิก'
      });
    }

    // Add formatted dates (including enter_date)
    const formattedData = addFormattedDates(rows[0], ['create_date', 'update_date', 'delete_date', 'enter_date']);

    res.json({
      success: true,
      data: formattedData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get member detail error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch member',
      message: error.message
    });
  }
};

export const getMemberList = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, keyword, user_level, user_type, customer_id, room_id } = req.query;

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

    // Keyword search (full_name, house_no, user_ref, member_ref)
    if (keyword && keyword.trim() !== '') {
      whereClause += ' AND (full_name LIKE ? OR house_no LIKE ? OR user_ref LIKE ? OR member_ref LIKE ?)';
      const searchTerm = `%${keyword.trim()}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // User level filter
    if (user_level !== undefined && user_level !== '') {
      whereClause += ' AND user_level = ?';
      queryParams.push(user_level);
    }

    // User type filter
    if (user_type !== undefined && user_type !== '') {
      whereClause += ' AND user_type = ?';
      queryParams.push(user_type);
    }

    // Customer filter (required)
    whereClause += ' AND customer_id = ?';
    queryParams.push(customer_id);

    // Room filter
    if (room_id !== undefined && room_id !== '' && parseInt(room_id) !== 0) {
      whereClause += ' AND room_id = ?';
      queryParams.push(parseInt(room_id));
    }

    const countQuery = `SELECT COUNT(*) as total FROM ${TABLE_INFORMATION} ${whereClause}`;
    const [countResult] = await db.execute(countQuery, queryParams);
    const total = countResult[0].total;

    const dataQuery = `
      SELECT id, upload_key, prefix_name, full_name, phone_number, email, enter_date, room_id, house_no, user_level, user_type, user_ref, member_ref, customer_id, status,
             create_date, create_by, update_date, update_by, delete_date, delete_by
      FROM ${TABLE_INFORMATION}
      ${whereClause}
      ORDER BY CASE WHEN user_level = 'owner' THEN 0 ELSE 1 END, create_date DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    const [rows] = await db.execute(dataQuery, queryParams);

    // Add formatted dates (including enter_date)
    const formattedRows = addFormattedDatesToList(rows, ['create_date', 'update_date', 'delete_date', 'enter_date']);

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
    logger.error('List member error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch members',
      message: error.message
    });
  }
};

/**
 * Get member ID by house number and full name
 * GET /api/member/getMemberIDByHouseNo?customer_id=xxx&house_no=xxx&full_name=xxx
 */
export const getMemberIDByHouseNo = async (req, res) => {
  try {
    const { customer_id, house_no, full_name } = req.query;

    // Validate required parameters
    if (!customer_id || !house_no || !full_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters',
        message: 'กรุณาระบุ customer_id, house_no และ full_name',
        required: ['customer_id', 'house_no', 'full_name']
      });
    }

    const db = getDatabase();

    // Build query with all required parameters
    const query = `
      SELECT id, house_no, full_name, prefix_name, user_level
      FROM ${TABLE_INFORMATION}
      WHERE house_no = ? AND customer_id = ? AND full_name = ? AND status != 2
      LIMIT 1
    `;

    const queryParams = [house_no, customer_id, full_name.trim()];

    const [rows] = await db.execute(query, queryParams);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Member not found',
        message: 'ไม่พบสมาชิกในบ้านเลขที่นี้'
      });
    }

    res.json({
      success: true,
      data: {
        member_id: rows[0].id,
        house_no: rows[0].house_no,
        full_name: rows[0].full_name,
        prefix_name: rows[0].prefix_name,
        user_level: rows[0].user_level
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get member ID by house no error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get member ID',
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสมาชิก',
      details: error.message
    });
  }
};

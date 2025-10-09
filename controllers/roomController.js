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

    let whereClause = 'WHERE r.status != 2';
    let queryParams = [];

    // Status filter
    if (status !== undefined) {
      whereClause += ' AND r.status = ?';
      queryParams.push(parseInt(status));
    }

    // Keyword search (title, owner full_name, owner phone_number, or any member in the room)
    if (keyword && keyword.trim() !== '') {
      whereClause += ` AND (
        r.title LIKE ?
        OR m.full_name LIKE ?
        OR m.phone_number LIKE ?
        OR EXISTS (
          SELECT 1 FROM member_information m2
          WHERE m2.room_id = r.id
          AND m2.status != 2
          AND (m2.full_name LIKE ? OR m2.phone_number LIKE ?)
        )
      )`;
      const searchTerm = `%${keyword.trim()}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Type filter
    if (type_id !== undefined && type_id !== '' && parseInt(type_id) !== 0) {
      whereClause += ' AND r.type_id = ?';
      queryParams.push(parseInt(type_id));
    }

    // Customer filter (required)
    whereClause += ' AND r.customer_id = ?';
    queryParams.push(customer_id);

    // Owner filter
    if (owner_id !== undefined && owner_id !== '' && parseInt(owner_id) !== 0) {
      whereClause += ' AND r.owner_id = ?';
      queryParams.push(parseInt(owner_id));
    }

    const countQuery = `
      SELECT COUNT(*) as total
      FROM ${TABLE_INFORMATION} r
      LEFT JOIN member_information m ON r.owner_id = m.id
      ${whereClause}
    `;
    const [countResult] = await db.execute(countQuery, queryParams);
    const total = countResult[0].total;

    const dataQuery = `
      SELECT r.id, r.upload_key, r.title, r.type_id, r.customer_id, r.owner_id, r.status,
             r.create_date, r.create_by, r.update_date, r.update_by, r.delete_date, r.delete_by,
             m.id as owner_member_id, m.prefix_name as owner_prefix_name, m.full_name as owner_full_name,
             m.phone_number as owner_phone_number, m.email as owner_email,
             m.user_level as owner_user_level, m.user_type as owner_user_type
      FROM ${TABLE_INFORMATION} r
      LEFT JOIN member_information m ON r.owner_id = m.id
      ${whereClause}
      ORDER BY r.create_date DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    const [rows] = await db.execute(dataQuery, queryParams);

    // Add formatted dates
    const formattedRows = addFormattedDatesToList(rows);

    // Get all room IDs to fetch members
    const roomIds = formattedRows.map(row => row.id);

    let membersByRoom = {};
    if (roomIds.length > 0) {
      const placeholders = roomIds.map(() => '?').join(',');
      const membersQuery = `
        SELECT id, room_id, full_name, phone_number, email, user_level, user_type
        FROM member_information
        WHERE room_id IN (${placeholders}) AND status != 2
        ORDER BY room_id ASC, CASE WHEN user_level = 'owner' THEN 0 ELSE 1 END, id ASC
      `;
      const [members] = await db.execute(membersQuery, roomIds);

      // Group members by room_id
      members.forEach(member => {
        if (!membersByRoom[member.room_id]) {
          membersByRoom[member.room_id] = [];
        }
        const { room_id, ...memberData } = member;
        membersByRoom[member.room_id].push(memberData);
      });
    }

    // Format owner data and members as nested objects
    const finalRows = formattedRows.map(row => {
      const { owner_member_id, owner_prefix_name, owner_full_name, owner_phone_number, owner_email, owner_user_level, owner_user_type, ...roomData } = row;

      return {
        ...roomData,
        owner: owner_member_id ? {
          id: owner_member_id,
          prefix_name: owner_prefix_name,
          full_name: owner_full_name,
          phone_number: owner_phone_number,
          email: owner_email,
          user_level: owner_user_level,
          user_type: owner_user_type
        } : null,
        members: membersByRoom[roomData.id] || []
      };
    });

    res.json({
      success: true,
      data: finalRows,
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

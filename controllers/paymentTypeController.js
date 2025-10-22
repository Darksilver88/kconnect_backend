import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { addFormattedDatesToList } from '../utils/dateFormatter.js';

const MENU = 'payment_type';
const TABLE_INFORMATION = `${MENU}_information`;

export const getPaymentTypeList = async (req, res) => {
  try {
    const { page = 1, limit = 100, status, keyword } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 100;
    const offset = (pageNum - 1) * limitNum;

    const db = getDatabase();

    let whereClause = 'WHERE status != 2';
    let queryParams = [];

    // Status filter
    if (status !== undefined) {
      whereClause += ' AND status = ?';
      queryParams.push(parseInt(status));
    }

    // Keyword search (title and detail)
    if (keyword && keyword.trim() !== '') {
      whereClause += ' AND (title LIKE ? OR detail LIKE ?)';
      const searchTerm = `%${keyword.trim()}%`;
      queryParams.push(searchTerm, searchTerm);
    }

    const countQuery = `SELECT COUNT(*) as total FROM ${TABLE_INFORMATION} ${whereClause}`;
    const [countResult] = await db.execute(countQuery, queryParams);
    const total = countResult[0].total;

    const dataQuery = `
      SELECT id, upload_key, title, detail, status,
             create_date, create_by, update_date, update_by, delete_date, delete_by
      FROM ${TABLE_INFORMATION}
      ${whereClause}
      ORDER BY id ASC
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
    logger.error('List payment type error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment types',
      message: error.message
    });
  }
};

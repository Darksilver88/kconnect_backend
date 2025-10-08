import { getDatabase } from '../config/database.js';
import { createCategoryTable } from '../utils/fileUpload.js';
import logger from '../utils/logger.js';
import { addFormattedDatesToList, addFormattedDates } from '../utils/dateFormatter.js';

const MENU = 'news';
const TABLE_INFORMATION = `${MENU}_information`;
const TABLE_CATEGORY = `${MENU}_category`;
const TABLE_ATTACHMENT = `${MENU}_attachment`;

export const insertNews = async (req, res) => {
  try {
    const { title, detail, upload_key, status, uid, cid } = req.body;
    const files = req.files;

    if (!title || !detail || !upload_key || status === undefined || !uid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: title, detail, upload_key, status, uid',
        required: ['title', 'detail', 'upload_key', 'status', 'uid']
      });
    }

    const db = getDatabase();

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS ${TABLE_INFORMATION} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        upload_key CHAR(32) NOT NULL,
        title VARCHAR(255) NOT NULL,
        detail TEXT NOT NULL,
        cid INT NULL,
        status INT NOT NULL DEFAULT 1,
        create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        create_by INT NOT NULL,
        update_date TIMESTAMP NULL,
        update_by INT NULL,
        delete_date TIMESTAMP NULL,
        delete_by INT NULL
      )
    `;

    await db.execute(createTableQuery);
    await createCategoryTable(TABLE_CATEGORY);

    const insertQuery = `
      INSERT INTO ${TABLE_INFORMATION} (upload_key, title, detail, cid, status, create_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const cidValue = cid ? parseInt(cid) : null;
    const [result] = await db.execute(insertQuery, [upload_key, title, detail, cidValue, status, uid]);


    res.json({
      success: true,
      message: 'News inserted successfully',
      data: {
        id: result.insertId,
        upload_key,
        title,
        detail,
        cid: cidValue,
        status,
        create_by: uid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Insert news error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to insert news',
      message: error.message
    });
  }
};

export const updateNews = async (req, res) => {
  try {
    const { id, title, detail, status, uid, cid } = req.body;

    if (!id || !title || !detail || status === undefined || !uid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: id, title, detail, status, uid',
        required: ['id', 'title', 'detail', 'status', 'uid']
      });
    }

    const db = getDatabase();

    const cidValue = cid ? parseInt(cid) : null;

    const updateQuery = `
      UPDATE ${TABLE_INFORMATION}
      SET title = ?, detail = ?, cid = ?, status = ?, update_date = CURRENT_TIMESTAMP, update_by = ?
      WHERE id = ? AND status != 2
    `;

    const [result] = await db.execute(updateQuery, [title, detail, cidValue, status, uid, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'News not found or already deleted',
        message: 'ไม่พบข่าวที่ต้องการแก้ไข หรืออาจถูกลบไปแล้ว'
      });
    }

    res.json({
      success: true,
      message: 'News updated successfully',
      data: {
        id,
        title,
        detail,
        cid: cidValue,
        status,
        update_by: uid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Update news error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update news',
      message: error.message
    });
  }
};

export const deleteNews = async (req, res) => {
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
      SET status = 2, delete_date = CURRENT_TIMESTAMP, delete_by = ?
      WHERE id = ? AND status != 2
    `;

    const [result] = await db.execute(deleteQuery, [uid, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'News not found or already deleted',
        message: 'ไม่พบข่าวที่ต้องการลบ หรืออาจถูกลบไปแล้ว'
      });
    }

    res.json({
      success: true,
      message: 'News deleted successfully',
      data: {
        id,
        delete_by: uid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Delete news error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete news',
      message: error.message
    });
  }
};

export const getNewsList = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, keyword, cid } = req.query;

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

    // Search/keyword filter (can be extended with more fields)
    if (keyword && keyword.trim() !== '') {
      whereClause += ' AND (title LIKE ? OR detail LIKE ?)';
      const searchTerm = `%${keyword.trim()}%`;
      queryParams.push(searchTerm, searchTerm);
    }

    // Field filters (can be extended with more fields like type_id, etc.)
    if (cid !== undefined && cid !== '' && parseInt(cid) !== 0) {
      whereClause += ' AND cid = ?';
      queryParams.push(parseInt(cid));
    }

    const countQuery = `SELECT COUNT(*) as total FROM ${TABLE_INFORMATION} ${whereClause}`;
    const [countResult] = await db.execute(countQuery, queryParams);
    const total = countResult[0].total;

    const dataQuery = `
      SELECT id, upload_key, title, detail, cid, status, create_date, create_by,
             update_date, update_by, delete_date, delete_by
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
    logger.error('List news error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch news',
      message: error.message
    });
  }
};

export const getNewsById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid ID parameter',
        message: 'ID ต้องเป็นตัวเลขเท่านั้น'
      });
    }

    const db = getDatabase();

    const query = `
      SELECT id, upload_key, title, detail, cid, status, create_date, create_by,
             update_date, update_by, delete_date, delete_by
      FROM ${TABLE_INFORMATION}
      WHERE id = ? AND status != 2
    `;

    const [rows] = await db.execute(query, [parseInt(id)]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'News not found',
        message: 'ไม่พบข่าวที่ต้องการ หรืออาจถูกลบไปแล้ว'
      });
    }

    // Get related attachments
    const attachmentQuery = `
      SELECT id, file_name, file_size, file_ext, file_path, create_date
      FROM ${TABLE_ATTACHMENT}
      WHERE upload_key = ? AND status != 2
      ORDER BY create_date ASC
    `;

    const [attachments] = await db.execute(attachmentQuery, [rows[0].upload_key]);

    // Add domain to file_path and format dates for attachments
    const domain = process.env.DOMAIN || 'http://localhost:3000';
    const attachmentsWithUrl = attachments.map(attachment => ({
      ...addFormattedDates(attachment, ['create_date']),
      file_path: `${domain}/${attachment.file_path}`
    }));

    // Format dates for main news data
    const formattedNews = addFormattedDates(rows[0]);

    res.json({
      success: true,
      data: {
        ...formattedNews,
        attachments: attachmentsWithUrl
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get news by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch news',
      message: error.message
    });
  }
};

// Category Functions
export const insertCategory = async (req, res) => {
  try {
    const { title, status, uid } = req.body;

    if (!title || status === undefined || !uid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: title, status, uid',
        required: ['title', 'status', 'uid']
      });
    }

    const db = getDatabase();
    await createCategoryTable(TABLE_CATEGORY);

    const insertQuery = `
      INSERT INTO ${TABLE_CATEGORY} (title, status, create_by)
      VALUES (?, ?, ?)
    `;

    const [result] = await db.execute(insertQuery, [title, status, uid]);

    res.json({
      success: true,
      message: 'Category inserted successfully',
      data: {
        id: result.insertId,
        title,
        status,
        create_by: uid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Insert category error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to insert category',
      message: error.message
    });
  }
};

export const updateCategory = async (req, res) => {
  try {
    const { id, title, status, uid } = req.body;

    if (!id || !title || status === undefined || !uid) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: id, title, status, uid',
        required: ['id', 'title', 'status', 'uid']
      });
    }

    const db = getDatabase();

    const updateQuery = `
      UPDATE ${TABLE_CATEGORY}
      SET title = ?, status = ?, update_date = CURRENT_TIMESTAMP, update_by = ?
      WHERE id = ? AND status != 2
    `;

    const [result] = await db.execute(updateQuery, [title, status, uid, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Category not found or already deleted',
        message: 'ไม่พบหมวดหมู่ที่ต้องการแก้ไข หรืออาจถูกลบไปแล้ว'
      });
    }

    res.json({
      success: true,
      message: 'Category updated successfully',
      data: {
        id,
        title,
        status,
        update_by: uid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Update category error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update category',
      message: error.message
    });
  }
};

export const deleteCategory = async (req, res) => {
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
      UPDATE ${TABLE_CATEGORY}
      SET status = 2, delete_date = CURRENT_TIMESTAMP, delete_by = ?
      WHERE id = ? AND status != 2
    `;

    const [result] = await db.execute(deleteQuery, [uid, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Category not found or already deleted',
        message: 'ไม่พบหมวดหมู่ที่ต้องการลบ หรืออาจถูกลบไปแล้ว'
      });
    }

    res.json({
      success: true,
      message: 'Category deleted successfully',
      data: {
        id,
        delete_by: uid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Delete category error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete category',
      message: error.message
    });
  }
};

export const getCategoryList = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    const db = getDatabase();

    let whereClause = 'WHERE status != 2';
    let queryParams = [];

    if (status !== undefined) {
      whereClause += ' AND status = ?';
      queryParams.push(parseInt(status));
    }

    const countQuery = `SELECT COUNT(*) as total FROM ${TABLE_CATEGORY} ${whereClause}`;
    const [countResult] = await db.execute(countQuery, queryParams);
    const total = countResult[0].total;

    const dataQuery = `
      SELECT id, title, status, create_date, create_by,
             update_date, update_by, delete_date, delete_by
      FROM ${TABLE_CATEGORY}
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
    logger.error('List category error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories',
      message: error.message
    });
  }
};
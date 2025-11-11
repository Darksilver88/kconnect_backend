import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { addFormattedDatesToList, addFormattedDates } from '../utils/dateFormatter.js';
import { getFileUrl } from '../utils/storageManager.js';
import { getFirestore } from '../config/firebase.js';

const MENU = 'bank';
const TABLE_INFORMATION = `${MENU}_information`;
const TABLE_ATTACHMENT = `${MENU}_attachment`;

/**
 * Helper function to get master bank list from Firebase
 * @returns {Promise<Array>} - Array of bank objects
 */
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

/**
 * Helper function to enrich bank data with master bank info
 * @param {Object} bank - Bank object with bank_id
 * @param {Array} masterBankList - Master bank list from Firebase
 * @returns {Object} - Bank object enriched with bank_name and bank_icon
 */
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

/**
 * Insert new bank
 * POST /api/bank/insert
 */
export const insertBank = async (req, res) => {
  try {
    const { upload_key, bank_account, bank_id, bank_no, type, status, customer_id, uid } = req.body;

    // Validate required fields
    const requiredFields = [];
    if (!upload_key) requiredFields.push('upload_key');
    if (!customer_id) requiredFields.push('customer_id');
    if (!status) requiredFields.push('status');
    if (!uid) requiredFields.push('uid');

    if (requiredFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: `กรุณากรอกข้อมูลที่จำเป็น: ${requiredFields.join(', ')}`,
        required: requiredFields
      });
    }

    const db = getDatabase();

    // Update only the latest attachment from status=0 to status=1 for this upload_key
    const updateAttachmentQuery = `
      UPDATE ${TABLE_ATTACHMENT}
      SET status = 1
      WHERE upload_key = ? AND status = 0
      ORDER BY id DESC
      LIMIT 1
    `;
    const [updateResult] = await db.execute(updateAttachmentQuery, [upload_key.trim()]);

    if (updateResult.affectedRows > 0) {
      logger.info(`Updated ${updateResult.affectedRows} attachments from status=0 to status=1 for upload_key=${upload_key}`);
    }

    const insertQuery = `
      INSERT INTO ${TABLE_INFORMATION} (
        upload_key, bank_account, bank_id, bank_no, type, status, customer_id, create_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.execute(insertQuery, [
      upload_key.trim(),
      bank_account || null,
      bank_id || null,
      bank_no || null,
      type || null,
      parseInt(status),
      customer_id.trim(),
      parseInt(uid)
    ]);

    logger.info(`Bank inserted: ID ${result.insertId} by user ${uid}`);

    res.json({
      success: true,
      message: 'เพิ่มข้อมูลธนาคารสำเร็จ',
      data: {
        id: result.insertId,
        upload_key: upload_key.trim(),
        bank_account,
        bank_id,
        bank_no,
        type,
        status: parseInt(status),
        customer_id: customer_id.trim()
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Insert bank error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to insert bank',
      message: error.message
    });
  }
};

/**
 * Get bank list with pagination
 * GET /api/bank/list?page=1&limit=10&keyword=search&customer_id=xxx
 */
export const getBankList = async (req, res) => {
  try {
    const { page = 1, limit = 10, keyword, customer_id } = req.query;

    // Validate required parameters
    if (!customer_id || customer_id.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณาระบุ customer_id',
        required: ['customer_id']
      });
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    const db = getDatabase();

    let whereClause = 'WHERE status != 2 AND customer_id = ?';
    let queryParams = [customer_id.trim()];

    // Keyword search (bank_account, bank_no, type)
    if (keyword && keyword.trim() !== '') {
      whereClause += ' AND (bank_account LIKE ? OR bank_no LIKE ? OR type LIKE ?)';
      const searchTerm = `%${keyword.trim()}%`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
    }

    const countQuery = `SELECT COUNT(*) as total FROM ${TABLE_INFORMATION} ${whereClause}`;
    const [countResult] = await db.execute(countQuery, queryParams);
    const total = countResult[0].total;

    const dataQuery = `
      SELECT id, upload_key, bank_account, bank_id, bank_no, type, status, customer_id,
             create_date, create_by, update_date, update_by, delete_date, delete_by
      FROM ${TABLE_INFORMATION}
      ${whereClause}
      ORDER BY create_date ASC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    const [rows] = await db.execute(dataQuery, queryParams);

    // Add formatted dates
    const formattedRows = addFormattedDatesToList(rows);

    // Get master bank list from Firebase
    const masterBankList = await getMasterBankListData();

    // Get attachments for each bank
    const banksWithAttachments = await Promise.all(
      formattedRows.map(async (bank) => {
        const attachmentQuery = `
          SELECT id, file_name, file_size, file_ext, file_path, create_date
          FROM ${TABLE_ATTACHMENT}
          WHERE upload_key = ? AND status = 1
          ORDER BY create_date ASC
        `;

        const [attachments] = await db.execute(attachmentQuery, [bank.upload_key]);

        // Format attachments with smart URL building
        const attachmentsWithUrl = attachments.map(attachment => ({
          ...addFormattedDates(attachment, ['create_date']),
          file_path: getFileUrl(attachment.file_path)
        }));

        // Enrich with master bank data
        const enrichedBank = enrichBankWithMasterData(bank, masterBankList);

        return {
          ...enrichedBank,
          attachments: attachmentsWithUrl
        };
      })
    );

    res.json({
      success: true,
      data: banksWithAttachments,
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
    logger.error('List bank error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch banks',
      message: error.message
    });
  }
};

/**
 * Get single bank detail by ID
 * GET /api/bank/:id
 */
export const getBankDetail = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameter',
        message: 'กรุณาระบุ ID'
      });
    }

    const db = getDatabase();

    const query = `
      SELECT id, upload_key, bank_account, bank_id, bank_no, type, status, customer_id,
             create_date, create_by, update_date, update_by, delete_date, delete_by
      FROM ${TABLE_INFORMATION}
      WHERE id = ? AND status != 2
    `;

    const [rows] = await db.execute(query, [parseInt(id)]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bank not found',
        message: 'ไม่พบข้อมูลธนาคาร'
      });
    }

    // Update all attachments from status=0 to status=2 for this upload_key
    const updateAttachmentQuery = `
      UPDATE ${TABLE_ATTACHMENT}
      SET status = 2
      WHERE upload_key = ? AND status = 0
    `;
    const [updateResult] = await db.execute(updateAttachmentQuery, [rows[0].upload_key]);

    if (updateResult.affectedRows > 0) {
      logger.info(`Updated ${updateResult.affectedRows} attachments from status=0 to status=2 for upload_key=${rows[0].upload_key}`);
    }

    // Get related attachments
    const attachmentQuery = `
      SELECT id, file_name, file_size, file_ext, file_path, create_date
      FROM ${TABLE_ATTACHMENT}
      WHERE upload_key = ? AND status = 1
      ORDER BY create_date ASC
    `;

    const [attachments] = await db.execute(attachmentQuery, [rows[0].upload_key]);

    // Format attachments with smart URL building
    const attachmentsWithUrl = attachments.map(attachment => ({
      ...addFormattedDates(attachment, ['create_date']),
      file_path: getFileUrl(attachment.file_path)
    }));

    // Format dates for main bank data
    const formattedBank = addFormattedDates(rows[0]);

    // Get master bank list from Firebase
    const masterBankList = await getMasterBankListData();

    // Enrich with master bank data
    const enrichedBank = enrichBankWithMasterData(formattedBank, masterBankList);

    res.json({
      success: true,
      data: {
        ...enrichedBank,
        attachments: attachmentsWithUrl
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get bank detail error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch bank detail',
      message: error.message
    });
  }
};

/**
 * Update bank information
 * PUT /api/bank/update
 */
export const updateBank = async (req, res) => {
  try {
    const { id, bank_account, bank_id, bank_no, type, status, uid } = req.body;

    // Validate required fields
    const requiredFields = [];
    if (!id) requiredFields.push('id');
    if (!uid) requiredFields.push('uid');

    if (requiredFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: `กรุณากรอกข้อมูลที่จำเป็น: ${requiredFields.join(', ')}`,
        required: requiredFields
      });
    }

    const db = getDatabase();

    // Check if bank exists and get upload_key
    const checkQuery = `SELECT id, upload_key FROM ${TABLE_INFORMATION} WHERE id = ? AND status != 2`;
    const [currentRows] = await db.execute(checkQuery, [parseInt(id)]);

    if (currentRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bank not found',
        message: 'ไม่พบข้อมูลธนาคาร'
      });
    }

    const uploadKey = currentRows[0].upload_key;

    // Update only the latest attachment from status=0 to status=1 for this upload_key
    const updateAttachmentQuery = `
      UPDATE ${TABLE_ATTACHMENT}
      SET status = 1
      WHERE upload_key = ? AND status = 0
      ORDER BY id DESC
      LIMIT 1
    `;
    const [updateResult] = await db.execute(updateAttachmentQuery, [uploadKey]);

    if (updateResult.affectedRows > 0) {
      logger.info(`Updated ${updateResult.affectedRows} attachments from status=0 to status=1 for upload_key=${uploadKey}`);
    }

    // Build update query dynamically based on provided fields
    const updateFields = [];
    const updateValues = [];

    if (bank_account !== undefined) {
      updateFields.push('bank_account = ?');
      updateValues.push(bank_account);
    }

    if (bank_id !== undefined) {
      updateFields.push('bank_id = ?');
      updateValues.push(bank_id);
    }

    if (bank_no !== undefined) {
      updateFields.push('bank_no = ?');
      updateValues.push(bank_no);
    }

    if (type !== undefined) {
      updateFields.push('type = ?');
      updateValues.push(type);
    }

    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(parseInt(status));
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update',
        message: 'กรุณาระบุข้อมูลที่ต้องการอัปเดต'
      });
    }

    // Always update update_date and update_by
    updateFields.push('update_date = NOW()');
    updateFields.push('update_by = ?');
    updateValues.push(parseInt(uid));

    // Add id to the end of values array
    updateValues.push(parseInt(id));

    const updateQuery = `
      UPDATE ${TABLE_INFORMATION}
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `;

    await db.execute(updateQuery, updateValues);

    logger.info(`Bank updated: ID ${id} by user ${uid}`);

    res.json({
      success: true,
      message: 'อัปเดตข้อมูลธนาคารสำเร็จ',
      data: {
        id: parseInt(id)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Update bank error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update bank',
      message: error.message
    });
  }
};

/**
 * Soft delete bank (set status=2)
 * DELETE /api/bank/delete
 */
export const deleteBank = async (req, res) => {
  try {
    const { id, uid } = req.body;

    // Validate required fields
    const requiredFields = [];
    if (!id) requiredFields.push('id');
    if (!uid) requiredFields.push('uid');

    if (requiredFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: `กรุณากรอกข้อมูลที่จำเป็น: ${requiredFields.join(', ')}`,
        required: requiredFields
      });
    }

    const db = getDatabase();

    // Check if bank exists
    const checkQuery = `SELECT id FROM ${TABLE_INFORMATION} WHERE id = ? AND status != 2`;
    const [rows] = await db.execute(checkQuery, [parseInt(id)]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Bank not found',
        message: 'ไม่พบข้อมูลธนาคาร'
      });
    }

    // Soft delete (set status=2)
    const deleteQuery = `
      UPDATE ${TABLE_INFORMATION}
      SET status = 2,
          delete_date = NOW(),
          delete_by = ?
      WHERE id = ?
    `;

    await db.execute(deleteQuery, [parseInt(uid), parseInt(id)]);

    logger.info(`Bank deleted (soft): ID ${id} by user ${uid}`);

    res.json({
      success: true,
      message: 'ลบข้อมูลธนาคารสำเร็จ',
      data: {
        id: parseInt(id)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Delete bank error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete bank',
      message: error.message
    });
  }
};

/**
 * Get master bank list from Firebase
 * GET /api/bank/master_list
 */
export const getMasterBankList = async (req, res) => {
  try {
    const db = getFirestore();

    // Get bank_list from Firebase: kconnect_config/config/niti_config/config
    const docRef = db.collection('kconnect_config').doc('config').collection('niti_config').doc('config');
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        error: 'Configuration not found',
        message: 'ไม่พบข้อมูล bank list ใน Firebase'
      });
    }

    const data = doc.data();
    const bankList = data.bank_list || [];

    logger.info(`Master bank list fetched: ${bankList.length} banks`);

    res.json({
      success: true,
      data: bankList,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get master bank list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch master bank list',
      message: error.message
    });
  }
};

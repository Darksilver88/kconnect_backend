import { getDatabase } from '../config/database.js';
import path from 'path';
import logger from '../utils/logger.js';
import { getConfig } from '../utils/config.js';

export const uploadFiles = async (req, res) => {
  try {
    const { upload_key, menu } = req.body;
    const files = req.files;

    if (!upload_key || !menu) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: upload_key, menu',
        required: ['upload_key', 'menu']
      });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded',
        message: 'กรุณาเลือกไฟล์ที่ต้องการอัพโหลด'
      });
    }

    const db = getDatabase();
    const tableName = `${menu}_attachment`;

    // Check if table exists
    const checkTableQuery = `
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
      AND table_name = ?
    `;

    const [tableResult] = await db.execute(checkTableQuery, [tableName]);

    if (tableResult[0].count === 0) {
      return res.status(400).json({
        success: false,
        error: `Table '${tableName}' does not exist`,
        message: `ไม่พบตาราง ${tableName} กรุณาสร้างโมดูล ${menu} ก่อนใช้งาน`
      });
    }

    // Get config values for validation
    const maxFileCount = await getConfig('max_file_count') || 5;
    const maxFileSizeMB = await getConfig('max_file_size') || 10; // Config in MB
    const maxFileSize = maxFileSizeMB * 1024 * 1024; // Convert MB to bytes
    const allowedFileTypes = await getConfig('allowed_file_types') || ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'txt', 'zip', 'rar'];

    // Check existing files for this upload_key
    const [existingFiles] = await db.execute(
      `SELECT COUNT(*) as count FROM ${tableName} WHERE upload_key = ? AND status != 2`,
      [upload_key]
    );

    const existingCount = existingFiles[0].count;
    const totalFiles = existingCount + files.length;

    // Validate total file count (existing + new)
    if (totalFiles > maxFileCount) {
      return res.status(400).json({
        success: false,
        error: 'Total file limit exceeded',
        message: `มีไฟล์อยู่แล้ว ${existingCount} ไฟล์ การเพิ่ม ${files.length} ไฟล์จะเกินจำนวนสูงสุด ${maxFileCount} ไฟล์`,
        details: {
          existing_files: existingCount,
          new_files: files.length,
          total_would_be: totalFiles,
          max_allowed: maxFileCount
        }
      });
    }

    // Validate each file
    for (const file of files) {
      // Check file size
      if (file.size > maxFileSize) {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);

        return res.status(400).json({
          success: false,
          error: 'File too large',
          message: `ไฟล์ '${file.originalname}' มีขนาด ${fileSizeMB}MB เกินขนาดสูงสุดที่กำหนด ${maxFileSizeMB}MB`,
          details: {
            filename: file.originalname,
            file_size: file.size,
            max_size_mb: maxFileSizeMB
          }
        });
      }

      // Check file type
      const fileExt = path.extname(file.originalname).slice(1).toLowerCase();
      if (!allowedFileTypes.includes(fileExt)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid file type',
          message: `ไม่รองรับไฟล์ประเภท '.${fileExt}' ประเภทที่รองรับ: ${allowedFileTypes.join(', ')}`,
          details: {
            filename: file.originalname,
            file_extension: fileExt,
            allowed_types: allowedFileTypes
          }
        });
      }
    }

    // Process files
    const attachmentResults = [];
    const domain = process.env.DOMAIN || 'http://localhost:3000';

    for (const file of files) {
      const fileInfo = {
        upload_key: upload_key,
        file_name: file.originalname,
        file_size: file.size,
        file_ext: path.extname(file.originalname).slice(1),
        file_path: file.path,
        create_by: 1 // Default user, should be from auth
      };

      const insertAttachmentQuery = `
        INSERT INTO ${tableName} (upload_key, file_name, file_size, file_ext, file_path, create_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      const [result] = await db.execute(insertAttachmentQuery, [
        fileInfo.upload_key,
        fileInfo.file_name,
        fileInfo.file_size,
        fileInfo.file_ext,
        fileInfo.file_path,
        fileInfo.create_by
      ]);

      attachmentResults.push({
        id: result.insertId,
        ...fileInfo,
        file_path: `${domain}/${file.path}`
      });
    }

    res.json({
      success: true,
      message: 'Files uploaded successfully',
      data: {
        upload_key: upload_key,
        menu: menu,
        table: tableName,
        files: attachmentResults,
        count: attachmentResults.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Upload files error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload files',
      message: error.message
    });
  }
};

export const deleteFile = async (req, res) => {
  try {
    const { id, uid, menu } = req.body;

    if (!id || !uid || !menu) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณากรอกข้อมูลที่จำเป็น: id, uid, menu',
        required: ['id', 'uid', 'menu']
      });
    }

    const db = getDatabase();
    const tableName = `${menu}_attachment`;

    // Check if table exists
    const checkTableQuery = `
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
      AND table_name = ?
    `;

    const [tableResult] = await db.execute(checkTableQuery, [tableName]);

    if (tableResult[0].count === 0) {
      return res.status(400).json({
        success: false,
        error: `Table '${tableName}' does not exist`,
        message: `ไม่พบตาราง ${tableName} กรุณาสร้างโมดูล ${menu} ก่อนใช้งาน`
      });
    }

    // Soft delete file (set status = 2)
    const deleteQuery = `
      UPDATE ${tableName}
      SET status = 2, delete_date = CURRENT_TIMESTAMP, delete_by = ?
      WHERE id = ? AND status != 2
    `;

    const [result] = await db.execute(deleteQuery, [uid, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'File not found or already deleted',
        message: 'ไม่พบไฟล์ที่ต้องการลบ หรืออาจถูกลบไปแล้ว'
      });
    }

    res.json({
      success: true,
      message: 'File deleted successfully',
      data: {
        id: parseInt(id),
        menu: menu,
        table: tableName,
        delete_by: uid
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Delete file error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete file',
      message: error.message
    });
  }
};
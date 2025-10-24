import path from 'path';
import fs from 'fs';
import { getDatabase } from '../config/database.js';
import logger from './logger.js';
import { uploadToFirebase, deleteFromFirebase } from './firebaseStorage.js';

/**
 * Get upload type from environment
 * @returns {'firebase' | 'project'}
 */
export function getUploadType() {
  return process.env.UPLOAD_TYPE || 'firebase';
}

/**
 * Upload file to storage (Firebase or Project)
 * @param {Object} file - Multer file object
 * @param {string} menu - Module/menu name
 * @returns {Promise<Object>} Upload result with file info
 */
export async function uploadFile(file, menu = 'general') {
  const uploadType = getUploadType();

  if (uploadType === 'firebase') {
    // Upload to Firebase Storage
    return await uploadToFirebase(file, menu);
  } else {
    // Upload to Project (local filesystem)
    return await uploadToProject(file, menu);
  }
}

/**
 * Upload file to project directory (local filesystem)
 * @param {Object} file - Multer file object
 * @param {string} menu - Module/menu name
 * @returns {Promise<Object>} Upload result with file info
 */
async function uploadToProject(file, menu = 'general') {
  try {
    const uploadDir = './uploads';
    const targetDir = path.join(uploadDir, menu);

    // Create directory if not exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Generate unique filename with timestamp
    const now = new Date();
    const dateFormat = now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
    const uniqueSuffix = dateFormat + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const filename = uniqueSuffix + ext;
    const filePath = path.join(targetDir, filename);

    // Write file to disk
    fs.writeFileSync(filePath, file.buffer);

    logger.info(`File uploaded to project: ${filePath}`);

    return {
      filename: filename,
      originalName: file.originalname,
      size: file.size,
      ext: ext.slice(1),
      path: filePath, // Local path
      mimetype: file.mimetype
    };
  } catch (error) {
    logger.error('Project upload error:', error);
    throw error;
  }
}

/**
 * Delete file from storage (Firebase or Project)
 * @param {string} filePath - File path (Firebase URL or local path)
 * @returns {Promise<boolean>}
 */
export async function deleteFile(filePath) {
  const uploadType = getUploadType();

  if (uploadType === 'firebase') {
    // Delete from Firebase Storage
    return await deleteFromFirebase(filePath);
  } else {
    // Delete from Project (local filesystem)
    return await deleteFromProject(filePath);
  }
}

/**
 * Delete file from project directory (local filesystem)
 * @param {string} filePath - Local file path
 * @returns {Promise<boolean>}
 */
async function deleteFromProject(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`File deleted from project: ${filePath}`);
      return true;
    } else {
      logger.warn(`File not found in project: ${filePath}`);
      return false;
    }
  } catch (error) {
    logger.error('Project delete error:', error);
    throw error;
  }
}

/**
 * Get full file URL based on upload type
 * @param {string} filePath - File path (Firebase URL or local path)
 * @returns {string} Full URL
 */
export function getFileUrl(filePath) {
  if (!filePath) return '';

  // Check if path already contains http/https (Firebase URL or full URL)
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }

  // Local path needs domain prefix
  const domain = process.env.DOMAIN || 'http://localhost:3000';
  return `${domain}/${filePath}`;
}

/**
 * Save file attachments to database after upload
 * @param {Array} files - Array of multer file objects
 * @param {string} uploadKey - Upload key for linking
 * @param {number} userId - User ID
 * @param {string} tableName - Target attachment table name
 * @param {string} menu - Module/menu name
 * @returns {Promise<Array>} Array of attachment records
 */
export async function saveFileAttachments(files, uploadKey, userId, tableName, menu = 'general') {
  if (!files || files.length === 0) return [];

  const db = getDatabase();

  // Create attachment table if not exists
  const createAttachmentTableQuery = `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      upload_key CHAR(32) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      file_size INT NOT NULL,
      file_ext VARCHAR(10) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      status INT NOT NULL DEFAULT 1,
      create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      create_by INT NOT NULL,
      update_date TIMESTAMP NULL,
      update_by INT NULL,
      delete_date TIMESTAMP NULL,
      delete_by INT NULL
    )
  `;

  await db.execute(createAttachmentTableQuery);

  const attachmentResults = [];

  // Upload files and save to database
  for (const file of files) {
    try {
      // Upload to storage (Firebase or Project)
      const uploadResult = await uploadFile(file, menu);

      // Save to database
      const fileInfo = {
        upload_key: uploadKey,
        file_name: uploadResult.originalName,
        file_size: uploadResult.size,
        file_ext: uploadResult.ext,
        file_path: uploadResult.path, // Storage path (URL or local path)
        create_by: userId
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
        ...fileInfo
      });
    } catch (error) {
      logger.error(`Failed to upload file ${file.originalname}:`, error);
      throw error;
    }
  }

  return attachmentResults;
}

/**
 * Soft delete file attachment (set status=2) - keep file in storage for backup
 * @param {number} fileId - File attachment ID
 * @param {number} userId - User ID
 * @param {string} tableName - Attachment table name
 * @returns {Promise<Object>} Result with file path
 */
export async function softDeleteFileAttachment(fileId, userId, tableName) {
  const db = getDatabase();

  // Get file info before soft delete
  const [files] = await db.execute(
    `SELECT file_path FROM ${tableName} WHERE id = ? AND status != 2`,
    [fileId]
  );

  if (files.length === 0) {
    throw new Error('File not found or already deleted');
  }

  const filePath = files[0].file_path;

  // Soft delete in database only (keep file in storage for backup)
  const softDeleteQuery = `
    UPDATE ${tableName}
    SET status = 2, delete_date = NOW(), delete_by = ?
    WHERE id = ?
  `;

  await db.execute(softDeleteQuery, [userId, fileId]);

  logger.info(`File soft deleted (kept in storage): ${filePath}`);

  return { filePath };
}

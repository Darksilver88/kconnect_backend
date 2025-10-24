import path from 'path';
import { getFirebaseBucket } from '../config/firebase.js';
import { getDatabase } from '../config/database.js';
import logger from './logger.js';

/**
 * Upload file to Firebase Storage
 * @param {Object} file - Multer file object
 * @param {string} menu - Module/menu name for folder organization
 * @returns {Promise<Object>} Upload result with public URL
 */
export async function uploadToFirebase(file, menu = 'general') {
  try {
    const bucket = getFirebaseBucket();

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
    const filename = `${menu}/${uniqueSuffix}${ext}`;

    // Upload to Firebase Storage
    const fileUpload = bucket.file(filename);
    const stream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype,
        metadata: {
          originalName: file.originalname,
          uploadDate: now.toISOString()
        }
      }
    });

    // Handle upload stream
    await new Promise((resolve, reject) => {
      stream.on('error', reject);
      stream.on('finish', resolve);
      stream.end(file.buffer);
    });

    // Make file publicly accessible
    await fileUpload.makePublic();

    // Get public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filename}`;

    logger.info(`File uploaded to Firebase: ${filename}`);

    return {
      filename: filename,
      originalName: file.originalname,
      size: file.size,
      ext: ext.slice(1),
      path: publicUrl,
      mimetype: file.mimetype
    };
  } catch (error) {
    logger.error('Firebase upload error:', error);
    throw error;
  }
}

/**
 * Delete file from Firebase Storage
 * @param {string} filePath - Full Firebase storage path (e.g., "news/20251022-123456.jpg")
 * @returns {Promise<boolean>}
 */
export async function deleteFromFirebase(filePath) {
  try {
    const bucket = getFirebaseBucket();

    // Extract filename from full URL if needed
    let filename = filePath;
    if (filePath.includes('storage.googleapis.com')) {
      const urlParts = filePath.split('/');
      // Get everything after bucket name
      const bucketIndex = urlParts.findIndex(part => part.includes('.appspot.com'));
      filename = urlParts.slice(bucketIndex + 1).join('/');
      // Decode URL encoding
      filename = decodeURIComponent(filename);
    }

    const file = bucket.file(filename);
    await file.delete();

    logger.info(`File deleted from Firebase: ${filename}`);
    return true;
  } catch (error) {
    if (error.code === 404) {
      logger.warn(`File not found in Firebase: ${filePath}`);
      return false;
    }
    logger.error('Firebase delete error:', error);
    throw error;
  }
}

/**
 * Save file attachments to database after Firebase upload
 * @param {Array} files - Array of multer file objects
 * @param {string} uploadKey - Upload key for linking
 * @param {number} userId - User ID
 * @param {string} tableName - Target attachment table name
 * @param {string} menu - Module/menu name
 * @returns {Promise<Array>} Array of attachment records
 */
export async function saveFileAttachmentsToFirebase(files, uploadKey, userId, tableName, menu = 'general') {
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

  // Upload files to Firebase and save to database
  for (const file of files) {
    try {
      // Upload to Firebase
      const uploadResult = await uploadToFirebase(file, menu);

      // Save to database
      const fileInfo = {
        upload_key: uploadKey,
        file_name: uploadResult.originalName,
        file_size: uploadResult.size,
        file_ext: uploadResult.ext,
        file_path: uploadResult.path, // Firebase public URL
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
 * Soft delete file attachment (set status=2) and delete from Firebase
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

  // Soft delete in database
  const softDeleteQuery = `
    UPDATE ${tableName}
    SET status = 2, delete_date = NOW(), delete_by = ?
    WHERE id = ?
  `;

  await db.execute(softDeleteQuery, [userId, fileId]);

  // Delete from Firebase Storage
  try {
    await deleteFromFirebase(filePath);
  } catch (error) {
    logger.warn(`Failed to delete file from Firebase (file may not exist): ${filePath}`);
  }

  return { filePath };
}

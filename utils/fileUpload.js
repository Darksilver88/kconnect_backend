import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getDatabase } from '../config/database.js';
import { getConfig } from './config.js';

const uploadDir = './uploads';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // For upload_file endpoint, get menu from body
    // For other endpoints, extract from URL or default
    const menu = req.body.menu || 'general';
    const targetDir = path.join(uploadDir, menu);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
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
    cb(null, filename);
  }
});

const fileFilter = async (req, file, cb) => {
  try {
    const allowedFileTypes = await getConfig('allowed_file_types') || ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'txt', 'zip', 'rar'];
    const fileExt = path.extname(file.originalname).slice(1).toLowerCase();

    if (allowedFileTypes.includes(fileExt)) {
      return cb(null, true);
    } else {
      cb(new Error(`File type '.${fileExt}' is not allowed. Allowed types: ${allowedFileTypes.join(', ')}`));
    }
  } catch (error) {
    cb(new Error('Error validating file type'));
  }
};

export const createUploadMiddleware = async () => {
  const maxFileSizeMB = await getConfig('max_file_size') || 10; // Config in MB
  const maxFileSize = maxFileSizeMB * 1024 * 1024; // Convert MB to bytes

  return multer({
    storage: storage,
    limits: {
      fileSize: maxFileSize
    },
    fileFilter: fileFilter
  });
};

// Default export for backward compatibility
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB as fallback (will be validated in controller)
  },
  fileFilter: (req, file, cb) => {
    // Basic validation, detailed validation in controller
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip|rar/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());

    if (extname) {
      return cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

export async function saveFileAttachments(files, uploadKey, userId, tableName) {
  if (!files || files.length === 0) return [];

  const db = getDatabase();

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

  for (const file of files) {
    const fileInfo = {
      upload_key: uploadKey,
      file_name: file.originalname,
      file_size: file.size,
      file_ext: path.extname(file.originalname).slice(1),
      file_path: file.path,
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
  }

  return attachmentResults;
}

export async function createCategoryTable(tableName) {
  const db = getDatabase();

  const createCategoryTableQuery = `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      status INT NOT NULL DEFAULT 1,
      create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      create_by INT NOT NULL,
      update_date TIMESTAMP NULL,
      update_by INT NULL,
      delete_date TIMESTAMP NULL,
      delete_by INT NULL
    )
  `;

  await db.execute(createCategoryTableQuery);
}
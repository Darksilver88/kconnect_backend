import multer from 'multer';
import path from 'path';
import { getDatabase } from '../config/database.js';
import { getConfig } from './config.js';

// Use memory storage for Firebase upload
const storage = multer.memoryStorage();

const fileFilter = async (req, file, cb) => {
  try {
    const allowedFileTypes = await getConfig('allowed_file_types') || ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'txt', 'zip', 'rar', 'xls', 'xlsx'];
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
// Uses async fileFilter with fallback values
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB as fallback
  },
  fileFilter: fileFilter
});

// This function now uses storageManager for hybrid upload support
export async function saveFileAttachments(files, uploadKey, userId, tableName, menu = 'general') {
  // Import dynamically to avoid circular dependency
  const { saveFileAttachments: saveFiles } = await import('./storageManager.js');

  // Use storage manager which handles both Firebase and Project uploads
  return saveFiles(files, uploadKey, userId, tableName, menu);
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
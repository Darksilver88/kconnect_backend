import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

let db;

async function initDatabase() {
  try {
    const config = {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    };

    logger.info('Connecting to MySQL database...', {
      host: config.host,
      port: config.port,
      user: config.user,
      database: config.database
    });

    db = await mysql.createConnection(config);

    logger.info('Connected to MySQL database successfully');
    return db;
  } catch (error) {
    logger.error('Database connection failed:', error);
    logger.error('Error details:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState
    });
    throw error;
  }
}

function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export { initDatabase, getDatabase };
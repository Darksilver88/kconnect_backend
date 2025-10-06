import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

let db;

async function initDatabase() {
  try {
    db = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    logger.info('Connected to MySQL database');
    return db;
  } catch (error) {
    logger.error('Database connection failed:', error.message);
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
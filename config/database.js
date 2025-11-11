import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

let pool;

async function initDatabase() {
  try {
    const config = {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      // Connection pool settings
      waitForConnections: true,
      connectionLimit: 10, // Maximum number of connections in pool
      queueLimit: 0, // Unlimited queued connection requests
      // Connection management
      enableKeepAlive: true, // Keep connections alive
      keepAliveInitialDelay: 0, // Start keep-alive immediately
      // Handle disconnections
      connectTimeout: 10000, // 10 seconds
      // Timezone (Thailand GMT+7)
      timezone: '+07:00'
    };

    logger.info('Creating MySQL connection pool...', {
      host: config.host,
      port: config.port,
      user: config.user,
      database: config.database,
      connectionLimit: config.connectionLimit
    });

    pool = mysql.createPool(config);

    // Set timezone for every new connection from pool
    pool.on('connection', (connection) => {
      connection.query("SET time_zone = '+07:00'");
    });

    // Test the connection
    const connection = await pool.getConnection();
    logger.info('MySQL connection pool created successfully');
    connection.release();

    return pool;
  } catch (error) {
    logger.error('Database connection pool creation failed:', error);
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
  if (!pool) {
    throw new Error('Database pool not initialized. Call initDatabase() first.');
  }
  return pool;
}

export { initDatabase, getDatabase };
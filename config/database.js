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
      // Timezone (Thailand GMT+7) - CRITICAL for Railway MySQL
      timezone: 'Z', // Use UTC in connection
      // Add charset
      charset: 'utf8mb4'
    };

    logger.info('Creating MySQL connection pool...', {
      host: config.host,
      port: config.port,
      user: config.user,
      database: config.database,
      connectionLimit: config.connectionLimit
    });

    pool = mysql.createPool(config);

    // Test the connection and force SET timezone
    const connection = await pool.getConnection();

    // FORCE timezone to Thailand (GMT+7) - This is the key fix
    await connection.query("SET time_zone = '+07:00'");

    logger.info('MySQL connection pool created successfully with timezone +07:00');
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

  // Wrap the pool to automatically set timezone on every query/execute
  const originalPool = pool;

  // Create a proxy that intercepts execute and query
  return new Proxy(originalPool, {
    get(target, prop) {
      if (prop === 'execute' || prop === 'query') {
        return async function(...args) {
          const connection = await target.getConnection();
          try {
            // Set timezone for this connection
            await connection.query("SET time_zone = '+07:00'");
            // Execute the original query
            const result = await connection[prop](...args);
            return result;
          } finally {
            connection.release();
          }
        };
      }
      if (prop === 'getConnection') {
        return async () => {
          const connection = await target.getConnection();
          // Set timezone for this connection
          await connection.query("SET time_zone = '+07:00'");
          return connection;
        };
      }
      return target[prop];
    }
  });
}

export { initDatabase, getDatabase };
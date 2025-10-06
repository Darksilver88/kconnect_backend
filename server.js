import express from 'express';
import dotenv from 'dotenv';
import { initDatabase } from './config/database.js';
import apiRoutes from './routes/index.js';
import { globalErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestLogger, errorLogger } from './middleware/logger.js';
import logger from './utils/logger.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Serve static files
app.use('/uploads', express.static('uploads'));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Routes
app.use('/api', apiRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// Error handlers
app.use('*', notFoundHandler);
app.use(errorLogger);
app.use(globalErrorHandler);

// Start server
async function startServer() {
  try {
    await initDatabase();

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Test endpoint: http://localhost:${PORT}/api/test`);
      logger.info(`Insert data: POST http://localhost:${PORT}/api/test-data/insert_data`);
      logger.info(`List data: GET http://localhost:${PORT}/api/test-data/list_data`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
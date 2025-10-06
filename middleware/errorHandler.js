import logger from '../utils/logger.js';

const globalErrorHandler = (error, req, res, next) => {
  logger.error('Global error:', error);

  res.status(error.status || 500).json({
    success: false,
    error: error.name || 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl
  });
};

export { globalErrorHandler, notFoundHandler };
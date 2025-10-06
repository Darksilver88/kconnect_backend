import logger from '../utils/logger.js';

export const requestLogger = (req, res, next) => {
  const start = Date.now();

  logger.info(`${req.method} ${req.originalUrl} - IP: ${req.ip || req.connection.remoteAddress}`);

  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
    originalSend.call(this, data);
  };

  next();
};

export const errorLogger = (err, req, res, next) => {
  logger.error(`${req.method} ${req.originalUrl} - Error: ${err.message} - Stack: ${err.stack}`);
  next(err);
};
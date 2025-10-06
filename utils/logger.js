import winston from 'winston';
import path from 'path';
import fs from 'fs';

const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const getLogFileName = () => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `log_${day}_${month}_${year}.log`;
};

const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message }) => {
    return `${timestamp} [${level.toUpperCase()}] ${message}`;
  })
);

const logLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

const logger = winston.createLogger({
  level: logLevel,
  format: customFormat,
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, getLogFileName()),
      level: logLevel
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      )
    })
  ]
});

const updateLogFile = () => {
  const newFileName = getLogFileName();
  const currentFileName = logger.transports[0].filename;

  if (!currentFileName.includes(newFileName)) {
    logger.transports[0].filename = path.join(logDir, newFileName);
  }
};

setInterval(updateLogFile, 60000);

export default logger;
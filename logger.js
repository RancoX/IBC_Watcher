import winston from "winston";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const logLevel = process.env.LOGGER_LEVEL || "info";

const logFilePath = path.join(import.meta.dirname, "logs", "ibc_watcher.log");

function formatDateTime() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

const logger = winston.createLogger({
  level: logLevel,

  format: winston.format.combine(
    winston.format.timestamp({
      format: formatDateTime,
    }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      return `${timestamp} [${level.toUpperCase()}] ${stack || message}`;
    })
  ),

  transports: [
    // Log to file
    new winston.transports.File({
      filename: logFilePath,
    }),

    // Also log to console
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

export default logger;
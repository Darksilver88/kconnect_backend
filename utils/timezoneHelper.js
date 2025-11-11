/**
 * Get current datetime in Thailand timezone (GMT+7)
 * Returns a Date object adjusted for Thailand timezone
 */
export function getThailandDate() {
  // Get current time
  const now = new Date();

  // Convert to Thailand timezone (UTC+7)
  const thaiOffset = 7 * 60; // 7 hours in minutes
  const localOffset = now.getTimezoneOffset(); // Local offset from UTC in minutes
  const totalOffset = thaiOffset + localOffset; // Total offset to add

  // Create new date with Thailand timezone
  const thailandTime = new Date(now.getTime() + (totalOffset * 60 * 1000));

  return thailandTime;
}

/**
 * Format Date object to MySQL DATETIME format (YYYY-MM-DD HH:mm:ss)
 * @param {Date} date - Date object to format
 * @returns {string} MySQL DATETIME string
 */
export function formatMySQLDateTime(date = null) {
  const d = date || getThailandDate();

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Get current datetime in Thailand timezone formatted for MySQL
 * @returns {string} MySQL DATETIME string (YYYY-MM-DD HH:mm:ss)
 */
export function now() {
  return formatMySQLDateTime(getThailandDate());
}

/**
 * Format date to Thai Buddhist calendar format
 * @param {Date|string} date - Date object or ISO string
 * @returns {string} Formatted date string (e.g., "8 ตุลาคม 2568 16:27:32")
 */
export function formatThaiDate(date) {
  if (!date) return null;

  const d = new Date(date);

  if (isNaN(d.getTime())) return null;

  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
  ];

  const day = d.getDate();
  const month = thaiMonths[d.getMonth()];
  const year = d.getFullYear() + 543; // Convert to Buddhist Era
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return `${day} ${month} ${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Add formatted date fields to a single record
 * @param {Object} record - Database record with date fields
 * @param {Array<string>} dateFields - Array of date field names to format
 * @returns {Object} Record with additional formatted date fields
 */
export function addFormattedDates(record, dateFields = ['create_date', 'update_date', 'delete_date']) {
  if (!record) return record;

  const formatted = { ...record };

  dateFields.forEach(field => {
    if (record[field]) {
      formatted[`${field}_formatted`] = formatThaiDate(record[field]);
    }
  });

  return formatted;
}

/**
 * Add formatted date fields to an array of records
 * @param {Array<Object>} records - Array of database records
 * @param {Array<string>} dateFields - Array of date field names to format
 * @returns {Array<Object>} Records with additional formatted date fields
 */
export function addFormattedDatesToList(records, dateFields = ['create_date', 'update_date', 'delete_date']) {
  if (!Array.isArray(records)) return records;

  return records.map(record => addFormattedDates(record, dateFields));
}

/**
 * Format number with comma separators
 * @param {number} num - Number to format
 * @returns {string} Formatted number with commas (e.g., "1,000")
 */
export function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format price with comma separators, ฿ prefix, and smart decimal display
 * @param {number} num - Number to format as price
 * @returns {string} Formatted price (e.g., "฿1,500" or "฿1,200.06")
 */
export function formatPrice(num) {
  // ตรวจสอบว่าเป็นจำนวนเต็มหรือไม่
  const isInteger = num % 1 === 0;

  if (isInteger) {
    // ถ้าเป็นจำนวนเต็ม ไม่แสดงทศนิยม
    const formatted = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `฿${formatted}`;
  } else {
    // ถ้ามีทศนิยม แสดงทศนิยม 2 ตำแหน่ง
    const formatted = num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `฿${formatted}`;
  }
}

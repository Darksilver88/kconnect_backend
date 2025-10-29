/**
 * Generate random alphanumeric key
 * @param {number} length - Length of the key (default: 32)
 * @returns {string} Random alphanumeric key
 */
export function generateUploadKey(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

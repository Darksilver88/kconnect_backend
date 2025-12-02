import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Get all app config (public endpoint, no authentication required)
 * GET /api/get_app_config
 */
export const getAppConfig = async (req, res) => {
  try {
    const db = getDatabase();

    const query = `
      SELECT config_key, config_value, data_type, description, is_active, update_date, update_by
      FROM app_config
      WHERE is_active = 1
      ORDER BY config_key ASC
    `;

    const [rows] = await db.execute(query);

    // Parse config values based on data_type
    const parsedRows = rows.map(row => {
      let parsedValue = row.config_value;

      try {
        switch (row.data_type) {
          case 'number':
            parsedValue = parseFloat(row.config_value);
            break;
          case 'boolean':
            parsedValue = row.config_value === 'true' || row.config_value === '1';
            break;
          case 'json':
            parsedValue = JSON.parse(row.config_value);
            break;
          case 'string':
          default:
            parsedValue = row.config_value;
            break;
        }
      } catch (error) {
        logger.warn(`Failed to parse config value for key ${row.config_key}:`, error.message);
        parsedValue = row.config_value;
      }

      return {
        ...row,
        config_value_parsed: parsedValue
      };
    });

    res.json({
      success: true,
      data: parsedRows,
      total: parsedRows.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Get app config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch app config',
      message: error.message
    });
  }
};

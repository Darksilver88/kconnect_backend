import { getDatabase } from '../config/database.js';
import logger from './logger.js';

export const getConfig = async (key) => {
  try {
    const db = getDatabase();
    const [rows] = await db.execute(
      'SELECT config_value, data_type FROM app_config WHERE config_key = ? AND is_active = TRUE',
      [key]
    );

    if (rows.length === 0) {
      logger.debug(`Config key '${key}' not found`);
      return null;
    }

    const { config_value, data_type } = rows[0];

    switch(data_type) {
      case 'number':
        return parseInt(config_value);
      case 'boolean':
        return config_value === 'true';
      case 'json':
        return JSON.parse(config_value);
      default:
        return config_value;
    }
  } catch (error) {
    logger.error(`Error getting config '${key}':`, error);
    return null;
  }
};

export const getAllConfigs = async () => {
  try {
    const db = getDatabase();
    const [rows] = await db.execute(
      'SELECT config_key, config_value, data_type, description FROM app_config WHERE is_active = TRUE ORDER BY config_key'
    );

    const configs = {};
    for (const row of rows) {
      const { config_key, config_value, data_type } = row;

      switch(data_type) {
        case 'number':
          configs[config_key] = parseInt(config_value);
          break;
        case 'boolean':
          configs[config_key] = config_value === 'true';
          break;
        case 'json':
          configs[config_key] = JSON.parse(config_value);
          break;
        default:
          configs[config_key] = config_value;
      }
    }

    return configs;
  } catch (error) {
    logger.error('Error getting all configs:', error);
    return {};
  }
};

export const setConfig = async (key, value, userId = 1) => {
  try {
    const db = getDatabase();
    const [result] = await db.execute(
      'UPDATE app_config SET config_value = ?, update_date = CURRENT_TIMESTAMP, update_by = ? WHERE config_key = ?',
      [String(value), userId, key]
    );

    if (result.affectedRows === 0) {
      logger.debug(`Config key '${key}' not found for update`);
      return false;
    }

    logger.info(`Config '${key}' updated to '${value}' by user ${userId}`);
    return true;
  } catch (error) {
    logger.error(`Error setting config '${key}':`, error);
    return false;
  }
};
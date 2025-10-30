import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Initialize app customer config with default values
 * POST /api/app_customer_config/init_config
 */
export const initAppCustomerConfig = async (req, res) => {
  try {
    const { customer_id } = req.body;

    // Validate required fields
    if (!customer_id || customer_id.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณาระบุ customer_id',
        required: ['customer_id']
      });
    }

    const db = getDatabase();

    const defaultConfigs = [
      {
        key: 'bank_transfer',
        value: 'true',
        type: 'boolean',
        title: 'โอนเงินผ่านธนาคาร',
        description: 'ลูกบ้านโอนเงินและส่งสลิปมาตรวจสอบ',
        icon: '<i class="fas fa-university text-xl"></i>',
        background_color: '#193cb8'
      }
      // Test configs (for testing different data types)
      // {
      //   key: 'payment_processing_fee',
      //   value: '2.5',
      //   type: 'number',
      //   title: 'ค่าธรรมเนียมการชำระเงิน',
      //   description: 'ค่าธรรมเนียมเพิ่มเติมสำหรับการชำระเงินออนไลน์ (%)',
      //   icon: '<i class="fas fa-percentage text-xl"></i>',
      //   background_color: '#f59e0b'
      // },
      // {
      //   key: 'payment_deadline_message',
      //   value: 'กรุณาชำระค่าส่วนกลางภายในวันที่ 5 ของทุกเดือน',
      //   type: 'string',
      //   title: 'ข้อความแจ้งเตือนกำหนดชำระ',
      //   description: 'ข้อความที่จะแสดงให้ลูกบ้านเห็นเกี่ยวกับกำหนดการชำระเงิน',
      //   icon: '<i class="fas fa-calendar-alt text-xl"></i>',
      //   background_color: '#10b981'
      // }
    ];

    const insertedConfigs = [];

    for (const config of defaultConfigs) {
      const insertQuery = `
        INSERT IGNORE INTO app_customer_config (config_key, config_value, data_type, title, description, icon, background_color, customer_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const [result] = await db.execute(insertQuery, [
        config.key,
        config.value,
        config.type,
        config.title,
        config.description,
        config.icon,
        config.background_color,
        customer_id.trim()
      ]);

      if (result.affectedRows > 0) {
        insertedConfigs.push({
          id: result.insertId,
          config_key: config.key,
          config_value: config.value,
          data_type: config.type,
          title: config.title,
          description: config.description,
          icon: config.icon,
          background_color: config.background_color,
          customer_id: customer_id.trim()
        });
      }
    }

    logger.info(`Initialized ${insertedConfigs.length} configs for customer_id: ${customer_id}`);

    res.json({
      success: true,
      message: 'App customer config initialized successfully',
      data: {
        customer_id: customer_id.trim(),
        configs_inserted: insertedConfigs,
        total_configs: insertedConfigs.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Init app customer config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initialize app customer config',
      message: error.message
    });
  }
};

/**
 * Update app customer config value
 * PUT /api/app_customer_config/update
 */
export const updateAppCustomerConfig = async (req, res) => {
  try {
    const { id, uid, config_value } = req.body;

    // Validate required fields
    const requiredFields = [];
    if (!id) requiredFields.push('id');
    if (!uid) requiredFields.push('uid');
    if (config_value === undefined || config_value === null) requiredFields.push('config_value');

    if (requiredFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: `กรุณากรอกข้อมูลที่จำเป็น: ${requiredFields.join(', ')}`,
        required: requiredFields
      });
    }

    const db = getDatabase();

    // Check if config exists and get old value
    const checkQuery = `SELECT id, config_key, config_value, data_type FROM app_customer_config WHERE id = ?`;
    const [rows] = await db.execute(checkQuery, [parseInt(id)]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Config not found',
        message: 'ไม่พบข้อมูล config'
      });
    }

    const oldValue = rows[0].config_value;
    const configKey = rows[0].config_key;
    const dataType = rows[0].data_type;

    // Convert config_value to string for storage based on data_type
    let valueToStore = config_value;

    try {
      switch (dataType) {
        case 'boolean':
          // Convert to 'true' or 'false' string
          // Handle both boolean and string inputs
          if (typeof config_value === 'string') {
            valueToStore = config_value.toLowerCase() === 'true' ? 'true' : 'false';
          } else {
            valueToStore = config_value ? 'true' : 'false';
          }
          break;
        case 'number':
          // Convert to string
          valueToStore = String(config_value);
          break;
        case 'json':
          // Convert to JSON string
          valueToStore = typeof config_value === 'string' ? config_value : JSON.stringify(config_value);
          break;
        case 'string':
        default:
          valueToStore = String(config_value);
          break;
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Invalid config value',
        message: `ค่า config_value ไม่ถูกต้องสำหรับประเภท ${dataType}`
      });
    }

    // Update config_value
    const updateQuery = `
      UPDATE app_customer_config
      SET config_value = ?,
          update_date = NOW(),
          update_by = ?
      WHERE id = ?
    `;

    await db.execute(updateQuery, [valueToStore, parseInt(uid), parseInt(id)]);

    logger.info(`Config updated: [${configKey}] ID ${id} by user ${uid} | Old: "${oldValue}" → New: "${valueToStore}"`);

    res.json({
      success: true,
      message: 'อัปเดตข้อมูล config สำเร็จ',
      data: {
        id: parseInt(id),
        config_value: valueToStore
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Update app customer config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update app customer config',
      message: error.message
    });
  }
};

/**
 * Get app customer config list with pagination
 * GET /api/app_customer_config/list?page=1&limit=10&customer_id=xxx&is_active=true
 */
export const getAppCustomerConfigList = async (req, res) => {
  try {
    const { page = 1, limit = 10, customer_id, is_active } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    const db = getDatabase();

    let whereClause = 'WHERE 1=1';
    let queryParams = [];

    // Filter by customer_id
    if (customer_id && customer_id.trim() !== '') {
      whereClause += ' AND customer_id = ?';
      queryParams.push(customer_id.trim());
    }

    // Filter by is_active
    if (is_active !== undefined && is_active !== '') {
      const isActiveValue = is_active === 'true' || is_active === '1' || is_active === 1;
      whereClause += ' AND is_active = ?';
      queryParams.push(isActiveValue);
    }

    const countQuery = `SELECT COUNT(*) as total FROM app_customer_config ${whereClause}`;
    const [countResult] = await db.execute(countQuery, queryParams);
    const total = countResult[0].total;

    const dataQuery = `
      SELECT id, config_key, config_value, data_type, title, description, icon, background_color, customer_id, is_active, create_date, update_date, update_by
      FROM app_customer_config
      ${whereClause}
      ORDER BY create_date DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    const [rows] = await db.execute(dataQuery, queryParams);

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
      pagination: {
        current_page: pageNum,
        per_page: limitNum,
        total: total,
        total_pages: Math.ceil(total / limitNum),
        has_next: pageNum * limitNum < total,
        has_prev: pageNum > 1
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('List app customer config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch app customer configs',
      message: error.message
    });
  }
};

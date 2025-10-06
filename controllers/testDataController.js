import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';

function generateRandomData() {
  const names = ['John Doe', 'Jane Smith', 'Mike Johnson', 'Sarah Wilson', 'David Brown', 'Lisa Davis'];
  const statuses = ['active', 'inactive', 'pending'];

  return {
    name: names[Math.floor(Math.random() * names.length)],
    status: statuses[Math.floor(Math.random() * statuses.length)]
  };
}

export const insertTestData = async (req, res) => {
  try {
    const db = getDatabase();

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS test_list (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        status ENUM('active', 'inactive', 'pending') NOT NULL,
        create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await db.execute(createTableQuery);
    logger.info('Table test_list checked/created');

    const randomData = generateRandomData();

    const insertQuery = `
      INSERT INTO test_list (name, status)
      VALUES (?, ?)
    `;

    const [result] = await db.execute(insertQuery, [randomData.name, randomData.status]);

    res.json({
      success: true,
      message: 'Data inserted successfully',
      data: {
        id: result.insertId,
        name: randomData.name,
        status: randomData.status
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Insert data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to insert data',
      message: error.message
    });
  }
};

export const getTestDataList = async (req, res) => {
  try {
    const db = getDatabase();
    const [rows] = await db.execute('SELECT * FROM test_list ORDER BY create_date DESC');

    res.json({
      success: true,
      data: rows,
      count: rows.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('List data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch data',
      message: error.message
    });
  }
};

export const createNewsAttachment = async (req, res) => {
  try {
    const db = getDatabase();

    const createAttachmentTableQuery = `
      CREATE TABLE IF NOT EXISTS news_attachment (
        id INT AUTO_INCREMENT PRIMARY KEY,
        upload_key CHAR(32) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        file_size INT NOT NULL,
        file_ext VARCHAR(10) NOT NULL,
        file_path VARCHAR(500) NOT NULL,
        status INT NOT NULL DEFAULT 1,
        create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        create_by INT NOT NULL,
        update_date TIMESTAMP NULL,
        update_by INT NULL,
        delete_date TIMESTAMP NULL,
        delete_by INT NULL
      )
    `;

    await db.execute(createAttachmentTableQuery);

    function generateRandomAttachment() {
      const fileNames = ['document.pdf', 'image.jpg', 'report.docx', 'data.xlsx', 'presentation.pptx'];
      const fileExts = ['pdf', 'jpg', 'docx', 'xlsx', 'pptx'];
      const randomIndex = Math.floor(Math.random() * fileNames.length);
      const uploadKey = Math.random().toString(36).substring(2, 34);

      return {
        upload_key: uploadKey,
        file_name: fileNames[randomIndex],
        file_size: Math.floor(Math.random() * 1000000) + 50000, // 50KB to 1MB
        file_ext: fileExts[randomIndex],
        file_path: `./uploads/${Date.now()}-${fileNames[randomIndex]}`,
        create_by: Math.floor(Math.random() * 10) + 1
      };
    }

    const attachmentData = generateRandomAttachment();

    const insertQuery = `
      INSERT INTO news_attachment (upload_key, file_name, file_size, file_ext, file_path, create_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.execute(insertQuery, [
      attachmentData.upload_key,
      attachmentData.file_name,
      attachmentData.file_size,
      attachmentData.file_ext,
      attachmentData.file_path,
      attachmentData.create_by
    ]);

    res.json({
      success: true,
      message: 'News attachment created successfully',
      data: {
        id: result.insertId,
        ...attachmentData
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Create news attachment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create news attachment',
      message: error.message
    });
  }
};

export const createAppConfig = async (req, res) => {
  try {
    const db = getDatabase();

    const createConfigTableQuery = `
      CREATE TABLE IF NOT EXISTS app_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        config_key VARCHAR(100) NOT NULL UNIQUE,
        config_value TEXT NOT NULL,
        data_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
        description VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        update_date TIMESTAMP NULL,
        update_by INT NULL
      )
    `;

    await db.execute(createConfigTableQuery);
    logger.info('Table app_config checked/created');

    const defaultConfigs = [
      {
        key: 'max_file_count',
        value: '5',
        type: 'number',
        description: 'Maximum number of files per upload'
      },
      {
        key: 'max_file_size',
        value: '10',
        type: 'number',
        description: 'Maximum file size in MB'
      },
      {
        key: 'allowed_file_types',
        value: JSON.stringify(['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'txt', 'zip', 'rar']),
        type: 'json',
        description: 'Allowed file extensions for upload'
      }
    ];

    const insertedConfigs = [];

    for (const config of defaultConfigs) {
      const insertQuery = `
        INSERT IGNORE INTO app_config (config_key, config_value, data_type, description)
        VALUES (?, ?, ?, ?)
      `;

      const [result] = await db.execute(insertQuery, [
        config.key,
        config.value,
        config.type,
        config.description
      ]);

      if (result.affectedRows > 0) {
        insertedConfigs.push({
          id: result.insertId,
          config_key: config.key,
          config_value: config.value,
          data_type: config.type,
          description: config.description
        });
      }
    }

    res.json({
      success: true,
      message: 'App config table created and initialized successfully',
      data: {
        table_created: true,
        configs_inserted: insertedConfigs,
        total_configs: insertedConfigs.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Create app config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create app config',
      message: error.message
    });
  }
};
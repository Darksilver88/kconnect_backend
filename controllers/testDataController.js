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

export const createBillAttachment = async (req, res) => {
  try {
    const db = getDatabase();

    const createAttachmentTableQuery = `
      CREATE TABLE IF NOT EXISTS bill_attachment (
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
    logger.info('Table bill_attachment checked/created');

    res.json({
      success: true,
      message: 'Bill attachment table created successfully',
      data: {
        table_name: 'bill_attachment',
        table_created: true
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Create bill attachment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create bill attachment table',
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

export const createRoomInformation = async (req, res) => {
  try {
    const db = getDatabase();

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS room_information (
        id INT AUTO_INCREMENT PRIMARY KEY,
        upload_key CHAR(32) NOT NULL,
        title VARCHAR(255) NOT NULL,
        type_id INT NULL,
        customer_id VARCHAR(255) NULL,
        owner_id INT NULL,
        status INT NOT NULL DEFAULT 1,
        create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        create_by INT NOT NULL,
        update_date TIMESTAMP NULL,
        update_by INT NULL,
        delete_date TIMESTAMP NULL,
        delete_by INT NULL
      )
    `;

    await db.execute(createTableQuery);
    logger.info('Table room_information checked/created');

    res.json({
      success: true,
      message: 'Room information table created successfully',
      data: {
        table_name: 'room_information',
        table_created: true,
        fields: [
          'id',
          'upload_key',
          'title',
          'type_id',
          'customer_id',
          'owner_id',
          'status',
          'create_date',
          'create_by',
          'update_date',
          'update_by',
          'delete_date',
          'delete_by'
        ]
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Create room information table error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create room information table',
      message: error.message
    });
  }
};

export const createMemberInformation = async (req, res) => {
  try {
    const db = getDatabase();

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS member_information (
        id INT AUTO_INCREMENT PRIMARY KEY,
        upload_key CHAR(32) NOT NULL,
        prefix_name VARCHAR(50) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        phone_number VARCHAR(50) NOT NULL,
        email VARCHAR(255) NOT NULL,
        enter_date TIMESTAMP NOT NULL,
        room_id INT NOT NULL,
        house_no VARCHAR(50) NOT NULL,
        user_level VARCHAR(50) NOT NULL,
        user_type VARCHAR(50) NOT NULL,
        user_ref VARCHAR(255) NOT NULL,
        member_ref VARCHAR(255) NOT NULL,
        customer_id VARCHAR(50) NOT NULL,
        status INT NOT NULL DEFAULT 1,
        create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        create_by INT NOT NULL,
        update_date TIMESTAMP NULL,
        update_by INT NULL,
        delete_date TIMESTAMP NULL,
        delete_by INT NULL
      )
    `;

    await db.execute(createTableQuery);
    logger.info('Table member_information checked/created');

    res.json({
      success: true,
      message: 'Member information table created successfully',
      data: {
        table_name: 'member_information',
        table_created: true,
        fields: [
          'id',
          'upload_key',
          'prefix_name',
          'full_name',
          'phone_number',
          'email',
          'enter_date',
          'room_id',
          'house_no',
          'user_level',
          'user_type',
          'user_ref',
          'member_ref',
          'customer_id',
          'status',
          'create_date',
          'create_by',
          'update_date',
          'update_by',
          'delete_date',
          'delete_by'
        ]
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Create member information table error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create member information table',
      message: error.message
    });
  }
};

export const createBillInformation = async (req, res) => {
  try {
    const db = getDatabase();

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS bill_information (
        id INT AUTO_INCREMENT PRIMARY KEY,
        upload_key CHAR(32) NOT NULL,
        bill_no VARCHAR(50) NULL,
        title VARCHAR(255) NOT NULL,
        bill_type_id INT NOT NULL,
        detail TEXT NOT NULL,
        expire_date TIMESTAMP NOT NULL,
        send_date TIMESTAMP NULL,
        remark TEXT NULL,
        customer_id VARCHAR(50) NOT NULL,
        status INT NOT NULL DEFAULT 1,
        create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        create_by INT NOT NULL,
        update_date TIMESTAMP NULL,
        update_by INT NULL,
        delete_date TIMESTAMP NULL,
        delete_by INT NULL
      )
    `;

    await db.execute(createTableQuery);
    logger.info('Table bill_information checked/created');

    res.json({
      success: true,
      message: 'Bill information table created successfully',
      data: {
        table_name: 'bill_information',
        table_created: true,
        fields: [
          'id',
          'upload_key',
          'bill_no',
          'title',
          'bill_type_id',
          'detail',
          'expire_date',
          'send_date',
          'remark',
          'customer_id',
          'status',
          'create_date',
          'create_by',
          'update_date',
          'update_by',
          'delete_date',
          'delete_by'
        ]
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Create bill information table error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create bill information table',
      message: error.message
    });
  }
};

export const createBillRoomInformation = async (req, res) => {
  try {
    const db = getDatabase();

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS bill_room_information (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bill_id INT NOT NULL,
        bill_no VARCHAR(50) NOT NULL,
        house_no VARCHAR(50) NOT NULL,
        member_name VARCHAR(255) NOT NULL,
        total_price DOUBLE NOT NULL,
        remark TEXT NULL,
        customer_id VARCHAR(50) NOT NULL,
        status INT NOT NULL DEFAULT 1,
        create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        create_by INT NOT NULL,
        update_date TIMESTAMP NULL,
        update_by INT NULL,
        delete_date TIMESTAMP NULL,
        delete_by INT NULL
      )
    `;

    await db.execute(createTableQuery);
    logger.info('Table bill_room_information checked/created');

    res.json({
      success: true,
      message: 'Bill room information table created successfully',
      data: {
        table_name: 'bill_room_information',
        table_created: true,
        fields: [
          'id',
          'bill_id',
          'bill_no',
          'house_no',
          'member_name',
          'total_price',
          'remark',
          'customer_id',
          'status',
          'create_date',
          'create_by',
          'update_date',
          'update_by',
          'delete_date',
          'delete_by'
        ]
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Create bill room information table error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create bill room information table',
      message: error.message
    });
  }
};

export const createBillTypeInformation = async (req, res) => {
  try {
    const db = getDatabase();

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS bill_type_information (
        id INT AUTO_INCREMENT PRIMARY KEY,
        upload_key CHAR(32) NOT NULL,
        title VARCHAR(255) NOT NULL,
        status INT NOT NULL DEFAULT 1,
        create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        create_by INT NOT NULL,
        update_date TIMESTAMP NULL,
        update_by INT NULL,
        delete_date TIMESTAMP NULL,
        delete_by INT NULL
      )
    `;

    await db.execute(createTableQuery);
    logger.info('Table bill_type_information checked/created');

    const defaultBillTypes = [
      { id: 1, title: 'ค่าส่วนกลาง' },
      { id: 2, title: 'ค่าน้ำ' },
      { id: 3, title: 'ค่าไฟ' },
      { id: 4, title: 'ค่าจอดรถ' },
      { id: 5, title: 'ค่าซ่อมแซม' },
      { id: 6, title: 'อื่นๆ' }
    ];

    const uploadKey = Math.random().toString(36).substring(2, 34);
    const insertedTypes = [];

    for (const type of defaultBillTypes) {
      const insertQuery = `
        INSERT IGNORE INTO bill_type_information (id, upload_key, title, status, create_by)
        VALUES (?, ?, ?, 1, -1)
      `;

      const [result] = await db.execute(insertQuery, [
        type.id,
        uploadKey,
        type.title
      ]);

      if (result.affectedRows > 0) {
        insertedTypes.push({
          id: type.id,
          title: type.title
        });
      }
    }

    res.json({
      success: true,
      message: 'Bill type information table created and initialized successfully',
      data: {
        table_name: 'bill_type_information',
        table_created: true,
        types_inserted: insertedTypes,
        total_types: insertedTypes.length,
        fields: [
          'id',
          'upload_key',
          'title',
          'status',
          'create_date',
          'create_by',
          'update_date',
          'update_by',
          'delete_date',
          'delete_by'
        ]
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Create bill type information table error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create bill type information table',
      message: error.message
    });
  }
};

export const createBillStatusTransaction = async (req, res) => {
  try {
    const db = getDatabase();

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS bill_status_transaction_information (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bill_id INT NOT NULL,
        status INT NOT NULL,
        create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        create_by INT NOT NULL
      )
    `;

    await db.execute(createTableQuery);
    logger.info('Table bill_status_transaction_information checked/created');

    res.json({
      success: true,
      message: 'Bill status transaction table created successfully',
      data: {
        table_name: 'bill_status_transaction_information',
        table_created: true,
        fields: [
          'id',
          'bill_id',
          'status',
          'create_date',
          'create_by'
        ]
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Create bill status transaction table error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create bill status transaction table',
      message: error.message
    });
  }
};
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
      },
      {
        key: 'notification_resend_interval_minutes',
        value: '30',
        type: 'number',
        description: 'Minimum interval in minutes between notification resends'
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
        customer_id VARCHAR(255) NOT NULL,
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
        customer_id VARCHAR(255) NOT NULL,
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
        customer_id VARCHAR(255) NOT NULL,
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

export const createBillAudit = async (req, res) => {
  try {
    const db = getDatabase();

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS bill_audit_information (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bill_id INT NOT NULL,
        status INT NOT NULL,
        create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        create_by INT NOT NULL
      )
    `;

    await db.execute(createTableQuery);
    logger.info('Table bill_audit_information checked/created');

    res.json({
      success: true,
      message: 'Bill audit table created successfully',
      data: {
        table_name: 'bill_audit_information',
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
    logger.error('Create bill audit table error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create bill audit table',
      message: error.message
    });
  }
};

export const createPaymentInformation = async (req, res) => {
  try {
    const db = getDatabase();

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS payment_information (
        id INT AUTO_INCREMENT PRIMARY KEY,
        upload_key CHAR(32) NOT NULL,
        payable_type VARCHAR(50) NOT NULL,
        payable_id INT NOT NULL,
        payment_amount DOUBLE NOT NULL,
        payment_type_id INT NOT NULL,
        customer_id VARCHAR(255) NOT NULL,
        status INT NOT NULL DEFAULT 1,
        member_id INT NOT NULL,
        remark TEXT NULL,
        create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        create_by INT NOT NULL,
        update_date TIMESTAMP NULL,
        update_by INT NULL,
        delete_date TIMESTAMP NULL,
        delete_by INT NULL,
        INDEX idx_payable (payable_type, payable_id)
      )
    `;

    await db.execute(createTableQuery);
    logger.info('Table payment_information checked/created (Polymorphic pattern)');

    res.json({
      success: true,
      message: 'Payment information table created successfully (Polymorphic Association)',
      data: {
        table_name: 'payment_information',
        table_created: true,
        pattern: 'Polymorphic Association (payable_type + payable_id)',
        fields: [
          'id',
          'upload_key',
          'payable_type',
          'payable_id',
          'payment_amount',
          'payment_type_id',
          'customer_id',
          'status',
          'member_id',
          'remark',
          'create_date',
          'create_by',
          'update_date',
          'update_by',
          'delete_date',
          'delete_by'
        ],
        indexes: [
          'PRIMARY (id)',
          'idx_payable (payable_type, payable_id)'
        ]
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Create payment information table error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create payment information table',
      message: error.message
    });
  }
};

export const createPaymentAttachment = async (req, res) => {
  try {
    const db = getDatabase();

    const createAttachmentTableQuery = `
      CREATE TABLE IF NOT EXISTS payment_attachment (
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
    logger.info('Table payment_attachment checked/created');

    res.json({
      success: true,
      message: 'Payment attachment table created successfully',
      data: {
        table_name: 'payment_attachment',
        table_created: true
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Create payment attachment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create payment attachment table',
      message: error.message
    });
  }
};

export const createPaymentTypeInformation = async (req, res) => {
  try {
    const db = getDatabase();

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS payment_type_information (
        id INT AUTO_INCREMENT PRIMARY KEY,
        upload_key CHAR(32) NOT NULL,
        title VARCHAR(255) NOT NULL,
        detail TEXT NOT NULL,
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
    logger.info('Table payment_type_information checked/created');

    const defaultPaymentTypes = [
      { id: 1, title: 'Mobile Banking', detail: 'ชำระผ่านแอปธนาคาร', status: 0 },
      { id: 2, title: 'โอนผ่านธนาคาร', detail: 'โอนเงินแล้วแนบสลิป', status: 1 },
      { id: 3, title: 'ชำระที่นิติบุคคล', detail: 'ชำระกับทางนิติบุคคลโดยตรง', status: 0 }
    ];

    const uploadKey = Math.random().toString(36).substring(2, 34);
    const insertedTypes = [];

    for (const type of defaultPaymentTypes) {
      const insertQuery = `
        INSERT IGNORE INTO payment_type_information (id, upload_key, title, detail, status, create_by)
        VALUES (?, ?, ?, ?, ?, -1)
      `;

      const [result] = await db.execute(insertQuery, [
        type.id,
        uploadKey,
        type.title,
        type.detail,
        type.status
      ]);

      if (result.affectedRows > 0) {
        insertedTypes.push({
          id: type.id,
          title: type.title,
          detail: type.detail,
          status: type.status
        });
      }
    }

    res.json({
      success: true,
      message: 'Payment type information table created and initialized successfully',
      data: {
        table_name: 'payment_type_information',
        table_created: true,
        types_inserted: insertedTypes,
        total_types: insertedTypes.length,
        fields: [
          'id',
          'upload_key',
          'title',
          'detail',
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
    logger.error('Create payment type information table error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create payment type information table',
      message: error.message
    });
  }
};

export const createBillTransactionInformation = async (req, res) => {
  try {
    const db = getDatabase();

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS bill_transaction_information (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bill_room_id INT NOT NULL,
        payment_id INT NULL,
        transaction_amount DECIMAL(10,2) NOT NULL,
        bill_transaction_type_id INT NULL COMMENT 'NULL if from payment approval, NOT NULL if manual entry',
        transaction_type_json JSON NULL COMMENT 'Additional payment method details',
        transaction_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        pay_date TIMESTAMP NOT NULL,
        transaction_type ENUM('full', 'partial') NOT NULL DEFAULT 'full',
        remark TEXT NULL,
        customer_id VARCHAR(50) NOT NULL,
        status INT NOT NULL DEFAULT 1,
        create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        create_by INT NOT NULL,
        update_date TIMESTAMP NULL,
        update_by INT NULL,
        delete_date TIMESTAMP NULL,
        delete_by INT NULL,
        INDEX idx_bill_room_id (bill_room_id),
        INDEX idx_payment_id (payment_id),
        INDEX idx_customer_id (customer_id),
        INDEX idx_pay_date (pay_date)
      )
    `;

    await db.execute(createTableQuery);
    logger.info('Table bill_transaction_information checked/created');

    res.json({
      success: true,
      message: 'Bill transaction information table created successfully',
      data: {
        table_name: 'bill_transaction_information',
        table_created: true,
        description: 'Transaction log for all bill payments (both self-payment and manual entry by admin)',
        fields: [
          'id',
          'bill_room_id (FK to bill_room_information)',
          'payment_id (FK to payment_information, NULL if admin manual entry)',
          'transaction_amount',
          'bill_transaction_type_id (INT FK to bill_transaction_type_information)',
          'transaction_type_json (JSON - additional payment method details)',
          'transaction_date (when transaction recorded)',
          'pay_date (actual payment date)',
          'transaction_type (full/partial)',
          'remark',
          'customer_id',
          'status',
          'create_date',
          'create_by',
          'update_date',
          'update_by',
          'delete_date',
          'delete_by'
        ],
        indexes: [
          'PRIMARY (id)',
          'idx_bill_room_id (bill_room_id)',
          'idx_payment_id (payment_id)',
          'idx_customer_id (customer_id)',
          'idx_pay_date (pay_date)'
        ],
        use_cases: [
          '1. Record payment when admin approves (payment_id NOT NULL)',
          '2. Record payment when admin manually enters (payment_id NULL)',
          '3. Support partial payments (transaction_type = partial)',
          '4. Calculate bill_room status based on sum(transaction_amount) vs total_price'
        ]
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Create bill transaction information table error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create bill transaction information table',
      message: error.message
    });
  }
};

export const createBillTransactionTypeInformation = async (req, res) => {
  try {
    const db = getDatabase();

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS bill_transaction_type_information (
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
    logger.info('Table bill_transaction_type_information checked/created');

    const defaultTransactionTypes = [
      { id: 1, title: 'เงินสด' },
      { id: 2, title: 'โอนเงินธนาคาร' },
      { id: 3, title: 'เช็ค' },
      { id: 4, title: 'บัตรเครดิต' },
      { id: 5, title: 'อื่นๆ' },
      { id: 6, title: 'โอนเงินพร้อมแนบสลิป' }
    ];

    const uploadKey = Math.random().toString(36).substring(2, 34);
    const insertedTypes = [];

    for (const type of defaultTransactionTypes) {
      const insertQuery = `
        INSERT IGNORE INTO bill_transaction_type_information (id, upload_key, title, status, create_by)
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
      message: 'Bill transaction type information table created and initialized successfully',
      data: {
        table_name: 'bill_transaction_type_information',
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
    logger.error('Create bill transaction type information table error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create bill transaction type information table',
      message: error.message
    });
  }
};

export const createNotificationAudit = async (req, res) => {
  try {
    const db = getDatabase();

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS notification_audit_information (
        id INT AUTO_INCREMENT PRIMARY KEY,
        table_name VARCHAR(100) NOT NULL COMMENT 'ชื่อ table ต้นทาง เช่น bill_room_information, member_information',
        rows_id INT NOT NULL COMMENT 'ID ของ row ใน table ต้นทาง',
        title TEXT NULL COMMENT 'หัวข้อการแจ้งเตือน',
        detail TEXT NULL COMMENT 'รายละเอียดการแจ้งเตือน',
        topic VARCHAR(50) NULL COMMENT 'หัวข้อหมวดหมู่',
        type VARCHAR(50) NULL COMMENT 'ประเภทการแจ้งเตือน',
        receiver VARCHAR(255) NULL COMMENT 'ผู้รับการแจ้งเตือน',
        customer_id VARCHAR(255) NOT NULL,
        remark TEXT NULL COMMENT 'หมายเหตุ/เหตุผลในการส่งแจ้งเตือน',
        create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        create_by INT NOT NULL,

        INDEX idx_table_rows (table_name, rows_id),
        INDEX idx_customer (customer_id),
        INDEX idx_create_date (create_date),
        INDEX idx_table_rows_date (table_name, rows_id, create_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    await db.execute(createTableQuery);
    logger.info('Table notification_audit_information checked/created (Polymorphic pattern)');

    res.json({
      success: true,
      message: 'Notification audit table created successfully (Polymorphic Association)',
      data: {
        table_name: 'notification_audit_information',
        table_created: true,
        pattern: 'Polymorphic Association (table_name + rows_id)',
        description: 'Centralized notification audit log for multiple tables',
        fields: [
          'id',
          'table_name (VARCHAR 100) - ชื่อ table ต้นทาง',
          'rows_id (INT) - ID ของ row',
          'title (TEXT) - หัวข้อการแจ้งเตือน',
          'detail (TEXT) - รายละเอียดการแจ้งเตือน',
          'topic (VARCHAR 50) - หัวข้อหมวดหมู่',
          'type (VARCHAR 50) - ประเภทการแจ้งเตือน',
          'receiver (VARCHAR 255) - ผู้รับการแจ้งเตือน',
          'customer_id (VARCHAR 255)',
          'remark (TEXT) - หมายเหตุ/เหตุผล',
          'create_date (TIMESTAMP)',
          'create_by (INT)'
        ],
        indexes: [
          'PRIMARY (id)',
          'idx_table_rows (table_name, rows_id)',
          'idx_customer (customer_id)',
          'idx_create_date (create_date)',
          'idx_table_rows_date (table_name, rows_id, create_date)'
        ],
        use_cases: [
          '1. Log notification when bill is sent (bill_room_information)',
          '2. Log reminder notification (any table)',
          '3. Check last notification time (prevent spam)',
          '4. Support multiple notification sources'
        ]
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Create notification audit table error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create notification audit table',
      message: error.message
    });
  }
};

export const createBankInformation = async (req, res) => {
  try {
    const db = getDatabase();

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS bank_information (
        id INT AUTO_INCREMENT PRIMARY KEY,
        upload_key CHAR(32) NOT NULL,
        bank_account VARCHAR(50) NULL,
        bank_id INT NULL,
        bank_no VARCHAR(50) NULL,
        type VARCHAR(255) NULL,
        status INT NOT NULL DEFAULT 1,
        customer_id VARCHAR(255) NOT NULL,
        create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        create_by INT NOT NULL,
        update_date TIMESTAMP NULL,
        update_by INT NULL,
        delete_date TIMESTAMP NULL,
        delete_by INT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    await db.execute(createTableQuery);
    logger.info('Table bank_information checked/created');

    res.json({
      success: true,
      message: 'Bank information table created successfully',
      data: {
        table_name: 'bank_information',
        table_created: true,
        fields: [
          'id',
          'upload_key',
          'bank_account',
          'bank_id',
          'bank_no',
          'type',
          'status',
          'customer_id',
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
    logger.error('Create bank information table error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create bank information table',
      message: error.message
    });
  }
};

export const createBankAttachment = async (req, res) => {
  try {
    const db = getDatabase();

    const createAttachmentTableQuery = `
      CREATE TABLE IF NOT EXISTS bank_attachment (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    await db.execute(createAttachmentTableQuery);
    logger.info('Table bank_attachment checked/created');

    res.json({
      success: true,
      message: 'Bank attachment table created successfully',
      data: {
        table_name: 'bank_attachment',
        table_created: true
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Create bank attachment error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create bank attachment table',
      message: error.message
    });
  }
};

export const createAppCustomerConfig = async (req, res) => {
  try {
    const db = getDatabase();

    const createConfigTableQuery = `
      CREATE TABLE IF NOT EXISTS app_customer_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        config_key VARCHAR(100) NOT NULL UNIQUE,
        config_value TEXT NOT NULL,
        data_type ENUM('string', 'number', 'boolean', 'json') DEFAULT 'string',
        title VARCHAR(255),
        description VARCHAR(255),
        icon TEXT,
        background_color VARCHAR(50),
        customer_id VARCHAR(255) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        create_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        update_date TIMESTAMP NULL,
        update_by INT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `;

    await db.execute(createConfigTableQuery);
    logger.info('Table app_customer_config checked/created');

    res.json({
      success: true,
      message: 'App customer config table created successfully',
      data: {
        table_name: 'app_customer_config',
        table_created: true,
        fields: [
          'id',
          'config_key',
          'config_value',
          'data_type',
          'title',
          'description',
          'icon',
          'background_color',
          'customer_id',
          'is_active',
          'create_date',
          'update_date',
          'update_by'
        ]
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Create app customer config error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create app customer config table',
      message: error.message
    });
  }
};

/**
 * Clear all data from specified tables and reset AUTO_INCREMENT to 1
 * GET /api/test-data/clear_tables
 */
export const clearTables = async (req, res) => {
  try {
    const db = getDatabase();

    const tables = [
      'room_information',
      'payment_information',
      'payment_attachment',
      'member_information',
      'bill_transaction_information',
      'bill_room_information',
      'bill_information',
      'bill_audit_information',
      'bill_attachment',
      'notification_audit_information',
      'bank_information',
      'bank_attachment'
    ];

    const results = [];

    for (const table of tables) {
      try {
        // Delete all data
        await db.execute(`DELETE FROM ${table}`);

        // Reset AUTO_INCREMENT
        await db.execute(`ALTER TABLE ${table} AUTO_INCREMENT = 1`);

        results.push({
          table: table,
          status: 'success',
          message: 'Data cleared and AUTO_INCREMENT reset to 1'
        });

        logger.info(`Table ${table} cleared and AUTO_INCREMENT reset`);
      } catch (error) {
        results.push({
          table: table,
          status: 'error',
          message: error.message
        });

        logger.warn(`Failed to clear table ${table}:`, error.message);
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    res.json({
      success: true,
      message: `เคลียร์ข้อมูลเสร็จสิ้น: สำเร็จ ${successCount} tables, ล้มเหลว ${errorCount} tables`,
      data: {
        total_tables: tables.length,
        success_count: successCount,
        error_count: errorCount,
        results: results
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Clear tables error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear tables',
      message: error.message
    });
  }
};
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KConnect API is a Node.js REST API built with Express.js and MySQL for local development.

## Development Commands

```bash
# Install dependencies
npm install

# Start development server with auto-reload
npm run dev

# Start production server
npm start
```

## Architecture

**Framework**: Express.js with ES6 modules
**Database**: MySQL with mysql2 driver
**Configuration**: Environment variables via dotenv
**Pattern**: MVC with feature-based folder structure
**Logging**: Winston logger with daily file rotation

### Project Structure
```
kconnect_backend/
├── server.js              # Entry point & server setup
├── config/
│   └── database.js        # Database connection & config
├── routes/
│   ├── index.js          # Main API router
│   ├── testData.js       # Test data routes
│   ├── news.js           # News routes
│   ├── room.js           # Room routes
│   └── member.js         # Member routes
├── controllers/
│   ├── testDataController.js  # Test data & table creation
│   ├── newsController.js      # News business logic
│   ├── uploadController.js    # File upload business logic
│   ├── roomController.js      # Room business logic
│   └── memberController.js    # Member business logic
├── middleware/
│   ├── errorHandler.js   # Error handling middleware
│   └── logger.js         # Request logging middleware
├── utils/
│   ├── fileUpload.js     # File upload helpers & multer config
│   ├── logger.js         # Winston logger configuration
│   ├── config.js         # Dynamic config from database
│   └── dateFormatter.js  # Thai date formatting utilities
├── logs/                 # Log files (auto-created)
└── uploads/              # Uploaded files (auto-created)
    └── {menu}/           # Organized by menu/module
```

## Database Configuration

MySQL connection configured via .env file:
- `DB_HOST` - Database host (default: localhost)
- `DB_USER` - Database user (default: root)
- `DB_PASSWORD` - Database password
- `DB_NAME` - Database name (default: kconnect)
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment mode (development/production)
- `DOMAIN` - Base URL for file paths (default: http://localhost:3000)

**Connection Pattern**: Single MySQL connection created on startup via `mysql2/promise`

## API Endpoints

### General
- `GET /api/test` - Test endpoint returning API status and timestamp
- `GET /health` - Health check endpoint

### Test Data & Table Creation
- `GET /api/test-data/insert_data` - Insert random data into test_list table
- `GET /api/test-data/list_data` - Fetch all data from test_list table
- `GET /api/test-data/create_news_attachment` - Create news_attachment table
- `GET /api/test-data/create_app_config` - Create and initialize app_config table
- `GET /api/test-data/create_room_information` - Create room_information table
- `GET /api/test-data/create_member_information` - Create member_information table

### News API
- `POST /api/news/insert` - Insert news article
- `PUT /api/news/update` - Update news article
- `DELETE /api/news/delete` - Soft delete news article (set status=2)
- `GET /api/news/list` - List news with pagination
- `GET /api/news/{id}` - Get single news article by ID
- `POST /api/news/insert_category` - Insert news category
- `PUT /api/news/update_category` - Update news category
- `DELETE /api/news/delete_category` - Soft delete news category (set status=2)
- `GET /api/news/list_category` - List categories with pagination

### Room API
- `POST /api/room/insert` - Insert room (requires: title, upload_key, customer_id, owner_id, status, uid)
- `GET /api/room/list` - List rooms with pagination (requires: customer_id)

### Member API
- `POST /api/member/insert` - Insert member (requires: upload_key, prefix_name, full_name, phone_number, email, enter_date, room_id, house_no, user_level, user_type, user_ref, member_ref, customer_id, status, uid)
- `GET /api/member/list` - List members with pagination (requires: customer_id)

### File Upload API
- `POST /api/upload_file` - Upload files to specific module (menu + upload_key)
- `DELETE /api/delete_file` - Soft delete file attachment (set status=2)

### Database Schema

**test_list table:**
- `id` - INT AUTO_INCREMENT PRIMARY KEY
- `name` - VARCHAR(255) NOT NULL
- `status` - ENUM('active', 'inactive', 'pending') NOT NULL
- `create_date` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP

**news_information table:**
- `id` - INT AUTO_INCREMENT PRIMARY KEY
- `upload_key` - CHAR(32) NOT NULL
- `title` - VARCHAR(255) NOT NULL
- `detail` - TEXT NOT NULL
- `cid` - INT NULL (category ID)
- `status` - INT NOT NULL DEFAULT 1
- `create_date` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `create_by` - INT NOT NULL
- `update_date` - TIMESTAMP NULL
- `update_by` - INT NULL
- `delete_date` - TIMESTAMP NULL
- `delete_by` - INT NULL

**news_category table:**
- `id` - INT AUTO_INCREMENT PRIMARY KEY
- `title` - VARCHAR(255) NOT NULL
- `status` - INT NOT NULL DEFAULT 1
- `create_date` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `create_by` - INT NOT NULL
- `update_date` - TIMESTAMP NULL
- `update_by` - INT NULL
- `delete_date` - TIMESTAMP NULL
- `delete_by` - INT NULL

**{menu}_attachment table (dynamic):**
- `id` - INT AUTO_INCREMENT PRIMARY KEY
- `upload_key` - CHAR(32) NOT NULL
- `file_name` - VARCHAR(255) NOT NULL
- `file_size` - INT NOT NULL (bytes)
- `file_ext` - VARCHAR(10) NOT NULL
- `file_path` - VARCHAR(500) NOT NULL
- `status` - INT NOT NULL DEFAULT 1
- `create_date` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `create_by` - INT NOT NULL
- `update_date` - TIMESTAMP NULL
- `update_by` - INT NULL
- `delete_date` - TIMESTAMP NULL
- `delete_by` - INT NULL

**app_config table (system configuration):**
- `config_key` - VARCHAR PRIMARY KEY (e.g., 'max_file_size', 'allowed_file_types')
- `config_value` - TEXT NOT NULL (stored as string)
- `data_type` - ENUM('string', 'number', 'boolean', 'json')
- `description` - TEXT NULL
- `is_active` - BOOLEAN DEFAULT TRUE
- `update_date` - TIMESTAMP NULL
- `update_by` - INT NULL

**room_information table:**
- `id` - INT AUTO_INCREMENT PRIMARY KEY
- `upload_key` - CHAR(32) NOT NULL
- `title` - VARCHAR(255) NOT NULL
- `type_id` - INT NULL
- `customer_id` - VARCHAR(255) NULL
- `owner_id` - INT NULL
- `status` - INT NOT NULL DEFAULT 1
- `create_date` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `create_by` - INT NOT NULL
- `update_date` - TIMESTAMP NULL
- `update_by` - INT NULL
- `delete_date` - TIMESTAMP NULL
- `delete_by` - INT NULL

**member_information table:**
- `id` - INT AUTO_INCREMENT PRIMARY KEY
- `upload_key` - CHAR(32) NOT NULL
- `prefix_name` - VARCHAR(50) NOT NULL
- `full_name` - VARCHAR(255) NOT NULL
- `phone_number` - VARCHAR(50) NOT NULL
- `email` - VARCHAR(255) NOT NULL
- `enter_date` - TIMESTAMP NOT NULL
- `room_id` - INT NOT NULL
- `house_no` - VARCHAR(50) NOT NULL
- `user_level` - VARCHAR(50) NOT NULL
- `user_type` - VARCHAR(50) NOT NULL
- `user_ref` - VARCHAR(255) NOT NULL
- `member_ref` - VARCHAR(255) NOT NULL
- `customer_id` - VARCHAR(50) NOT NULL
- `status` - INT NOT NULL DEFAULT 1
- `create_date` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `create_by` - INT NOT NULL
- `update_date` - TIMESTAMP NULL
- `update_by` - INT NULL
- `delete_date` - TIMESTAMP NULL
- `delete_by` - INT NULL

### API Parameters

**News API:**
- **Insert**: `{title, detail, upload_key, status, uid, cid}`
- **Update**: `{id, title, detail, status, uid, cid}`
- **Delete**: `{id, uid}`
- **List**: `?page=1&limit=10&status=1&keyword=search&cid=1` (pagination + filters)

**News Category API:**
- **Insert**: `{title, status, uid}` via `/api/news/insert_category`
- **Update**: `{id, title, status, uid}` via `/api/news/update_category`
- **Delete**: `{id, uid}` via `/api/news/delete_category`
- **List**: `?page=1&limit=10&status=1` via `/api/news/list_category` (pagination + optional status filter)

**Room API:**
- **Insert**: `{title, upload_key, customer_id, owner_id, status, uid, type_id?}` via `/api/room/insert`
  - Required: title, upload_key, customer_id, owner_id, status, uid
  - Optional: type_id
- **List**: `?page=1&limit=10&status=1&keyword=search&type_id=1&customer_id=xxx&owner_id=1` via `/api/room/list`
  - Required: customer_id
  - Optional: page, limit, status, keyword, type_id, owner_id

**Member API:**
- **Insert**: `{upload_key, prefix_name, full_name, phone_number, email, enter_date, room_id, house_no, user_level, user_type, user_ref, member_ref, customer_id, status, uid}` via `/api/member/insert`
  - All fields are required
- **List**: `?page=1&limit=10&status=1&keyword=search&user_level=xxx&user_type=xxx&customer_id=xxx&room_id=1` via `/api/member/list`
  - Required: customer_id
  - Optional: page, limit, status, keyword, user_level, user_type, room_id

**File Upload API:**
- **Upload**: `{upload_key, menu}` + files via form-data to `/api/upload_file`
- **Delete**: `{id, uid, menu}` to `/api/delete_file` (soft delete)
- **Dynamic Tables**: Automatically detects `{menu}_attachment` table
- **Path Organization**: Files stored in `uploads/{menu}/` directory
- **Table Validation**: Returns error if target table doesn't exist

**News List Filters:**
- **Search**: `keyword` - searches in title and detail (LIKE %keyword%)
- **Category**: `cid` - filter by category ID (0 = all categories)
- **Status**: `status` - filter by status
- **Pagination**: `page`, `limit` - standard pagination

**Room List Filters:**
- **Search**: `keyword` - searches in title (LIKE %keyword%)
- **Type**: `type_id` - filter by room type ID (0 = all types)
- **Owner**: `owner_id` - filter by owner ID (0 = all owners)
- **Customer**: `customer_id` - REQUIRED - filter by customer ID
- **Status**: `status` - filter by status (default: excludes deleted records with status=2)
- **Pagination**: `page`, `limit` - standard pagination

**Member List Filters:**
- **Search**: `keyword` - searches in full_name, house_no, user_ref, member_ref (LIKE %keyword%)
- **User Level**: `user_level` - filter by user level
- **User Type**: `user_type` - filter by user type
- **Room**: `room_id` - filter by room ID (0 = all rooms)
- **Customer**: `customer_id` - REQUIRED - filter by customer ID
- **Status**: `status` - filter by status (default: excludes deleted records with status=2)
- **Pagination**: `page`, `limit` - standard pagination

### Date Formatting

All list and detail endpoints return dates in two formats:
- **ISO Format**: Original timestamp field (e.g., `create_date: "2025-10-08T09:27:32.000Z"`)
- **Thai Format**: Formatted field with `_formatted` suffix (e.g., `create_date_formatted: "8 ตุลาคม 2568 16:27:32"`)

**Formatted Date Fields**:
- Uses Thai Buddhist Era (พ.ศ.) - adds 543 years to Gregorian year
- Uses Thai month names (มกราคม, กุมภาพันธ์, etc.)
- Format: `{day} {month_thai} {year_buddhist} {HH}:{mm}:{ss}`
- Automatically applied to: `create_date`, `update_date`, `delete_date`, `enter_date` (member only)

**Implementation**:
```javascript
import { addFormattedDatesToList } from '../utils/dateFormatter.js';

// For single record
const formattedRecord = addFormattedDates(record);

// For list of records
const formattedRows = addFormattedDatesToList(rows);

// Specify which date fields to format (default: create_date, update_date, delete_date)
const formattedRows = addFormattedDatesToList(rows, ['create_date', 'update_date', 'delete_date', 'enter_date']);
```

### File Upload Support

- **Multiple Files**: Support multiple file uploads via form-data
- **File Types**: Default: jpeg, jpg, png, gif, pdf, doc, docx, txt, zip, rar (configurable via `app_config.allowed_file_types`)
- **Size Limit**: Default: 10MB per file (configurable via `app_config.max_file_size`)
- **File Count Limit**: Default: 5 files per upload_key (configurable via `app_config.max_file_count`)
- **Dynamic Storage**: Files stored in `uploads/{menu}/` based on menu parameter
- **Table Auto-Detection**: Uses `{menu}_attachment` table structure
- **Validation**:
  - Checks table existence before upload
  - Validates file size, type, and total file count
  - Counts existing files for upload_key before allowing new uploads
- **File URL**: Returns full URL using DOMAIN environment variable

## Error Handling

- Centralized error handling middleware in `middleware/errorHandler.js`
- Global error handler with development/production modes
- 404 handler for undefined routes
- Database connection error handling with graceful shutdown
- **Error Messages**: All validation errors include Thai language `message` field for frontend display
- **Error Response Format**:
  ```json
  {
    "success": false,
    "error": "Missing required fields",
    "message": "กรุณากรอกข้อมูลที่จำเป็น: field1, field2",
    "required": ["field1", "field2"]
  }
  ```

## Development Notes

- **Modular Structure**: Routes, controllers, and middleware separated by feature
- **ES6 Modules**: Uses import/export syntax throughout
- **CORS Enabled**: Cross-origin requests allowed (all origins via wildcard)
- **Auto Table Creation**: Tables created automatically on first use
- **Clean Separation**: Business logic in controllers, routing in routes/
- **Soft Deletes**: All deletions set `status=2` instead of removing records
- **Upload Key Pattern**: 32-character keys used to link attachments to content
- **Dynamic Config**: Runtime configuration stored in `app_config` table via `utils/config.js`

## Configuration System

The API uses a database-driven configuration system (`utils/config.js`) that allows runtime configuration without code changes:

**Available Functions**:
- `getConfig(key)` - Get single config value (auto-converts to correct data type)
- `getAllConfigs()` - Get all active configs as object
- `setConfig(key, value, userId)` - Update config value

**Common Config Keys**:
- `max_file_size` - Maximum file size in MB (default: 10)
- `max_file_count` - Maximum files per upload_key (default: 5)
- `allowed_file_types` - JSON array of allowed extensions

**Usage Example**:
```javascript
import { getConfig } from '../utils/config.js';

const maxSize = await getConfig('max_file_size') || 10;
const allowedTypes = await getConfig('allowed_file_types') || ['jpg', 'png'];
```

## Logging System

**Configuration**: Winston with daily file rotation in `utils/logger.js`
**Log Files**: `logs/log_DD_MM_YYYY.log` format (e.g., `log_06_10_2025.log`)
**Log Levels**: ERROR, INFO, DEBUG with timestamp and level tags
**Format**: `YYYY-MM-DD HH:mm:ss [LOG_LEVEL] message`

**Features**:
- **Daily Rotation**: New log file created each day automatically
- **Request Logging**: All API requests logged with method, URL, IP, status, and duration
- **Error Logging**: Detailed error logs with stack traces for debugging
- **Console Output**: Development-friendly colored console logs
- **File Storage**: Persistent logs stored in `logs/` directory

**Middleware**:
- **Request Logger**: Logs all incoming API requests and responses
- **Error Logger**: Logs all application errors before error handling

**Log Levels by Environment**:
- **Development** (`NODE_ENV=development`): Shows DEBUG, INFO, ERROR logs
- **Production** (`NODE_ENV=production`): Shows only INFO, ERROR logs

**Log Level Usage**:
- `logger.debug()` - For development debugging (req/res data, variables, flow tracking)
- `logger.info()` - For important business events (user actions, system status)
- `logger.error()` - For errors and exceptions (database errors, API failures)

**Environment Configuration**:
```bash
# Development (shows all logs including debug)
NODE_ENV=development

# Production (shows only info and error logs)
NODE_ENV=production
```

**Example Usage**:
```javascript
// Debug - Only in development
logger.debug('Request body:', req.body);
logger.debug('Query parameters:', { page, limit });

// Info - Always shown (important events)
logger.info(`User ${uid} deleted news ID: ${id}`);

// Error - Always shown (critical issues)
logger.error('Database connection failed:', error);
```
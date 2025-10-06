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
kconnect/
├── server.js              # Entry point & server setup
├── config/
│   └── database.js        # Database connection & config
├── routes/
│   ├── index.js          # Main API router
│   └── testData.js       # Test data routes
├── controllers/
│   └── testDataController.js  # Business logic
├── middleware/
│   ├── errorHandler.js   # Error handling middleware
│   └── logger.js         # Request logging middleware
├── utils/
│   ├── fileUpload.js     # File upload helpers
│   └── logger.js         # Winston logger configuration
└── logs/                 # Log files (auto-created)
```

## Database Configuration

MySQL connection configured via .env file:
- DB_HOST=localhost
- DB_USER=root
- DB_PASSWORD=04560456
- DB_NAME=kconnect
- PORT=3000

## API Endpoints

### General
- `GET /api/test` - Test endpoint returning API status and timestamp
- `GET /health` - Health check endpoint

### Test Data
- `GET /api/test-data/insert_data` - Insert random data into test_list table
- `GET /api/test-data/list_data` - Fetch all data from test_list table
- `GET /api/test-data/create_news_attachment` - Create random news attachment record

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

### File Upload API
- `POST /api/upload_file` - Upload files to specific module (menu + upload_key)

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

**news_attachment table:**
- `id` - INT AUTO_INCREMENT PRIMARY KEY
- `upload_key` - CHAR(32) NOT NULL
- `file_name` - VARCHAR(255) NOT NULL
- `file_size` - INT NOT NULL
- `file_ext` - VARCHAR(10) NOT NULL
- `file_path` - VARCHAR(500) NOT NULL
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

### File Upload Support

- **Multiple Files**: Support multiple file uploads via form-data
- **File Types**: jpeg, jpg, png, gif, pdf, doc, docx, txt, zip, rar
- **Size Limit**: 10MB per file
- **Dynamic Storage**: Files stored in `uploads/{menu}/` based on menu parameter
- **Table Auto-Detection**: Uses `{menu}_attachment` table structure
- **Error Handling**: Validates table existence before upload

## Error Handling

- Centralized error handling middleware in `middleware/errorHandler.js`
- Global error handler with development/production modes
- 404 handler for undefined routes
- Database connection error handling with graceful shutdown

## Development Notes

- **Modular Structure**: Routes, controllers, and middleware separated by feature
- **ES6 Modules**: Uses import/export syntax throughout
- **CORS Enabled**: Cross-origin requests allowed
- **Auto Table Creation**: Tables created automatically on first use
- **Clean Separation**: Business logic in controllers, routing in routes/

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
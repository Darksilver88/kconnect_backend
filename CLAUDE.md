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

**Port Configuration:**
- Port 3000: API backend (default, in use)
- Port 3001: Next.js frontend
- For testing: Use alternative ports (3002, 3003, etc.) to avoid conflicts

## Architecture

**Framework**: Express.js with ES6 modules
**Database**: MySQL with mysql2 driver
**Configuration**: Environment variables via dotenv
**Pattern**: MVC with feature-based folder structure
**Logging**: Winston logger with daily file rotation
**Excel Processing**: xlsx library for Excel import/export

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
│   ├── member.js         # Member routes
│   ├── bill.js           # Bill routes
│   ├── billType.js       # Bill Type routes
│   ├── billRoom.js       # Bill Room routes
│   ├── payment.js        # Payment routes
│   └── paymentType.js    # Payment Type routes
├── controllers/
│   ├── testDataController.js  # Test data & table creation
│   ├── newsController.js      # News business logic
│   ├── uploadController.js    # File upload business logic
│   ├── roomController.js      # Room business logic
│   ├── memberController.js    # Member business logic
│   ├── billController.js      # Bill business logic
│   ├── billTypeController.js  # Bill Type business logic
│   ├── billRoomController.js  # Bill Room business logic
│   ├── paymentController.js   # Payment business logic
│   └── paymentTypeController.js # Payment Type business logic
├── middleware/
│   ├── errorHandler.js   # Error handling middleware
│   └── logger.js         # Request logging middleware
├── utils/
│   ├── fileUpload.js     # File upload helpers & multer config
│   ├── logger.js         # Winston logger configuration
│   ├── config.js         # Dynamic config from database
│   ├── dateFormatter.js  # Date formatting utilities (DD/MM/YYYY HH:mm:ss)
│   └── numberFormatter.js # Number formatting utilities (comma, currency)
├── logs/                 # Log files (auto-created)
└── uploads/              # Uploaded files (auto-created)
    └── {menu}/           # Organized by menu/module
```

## Database Configuration

MySQL connection configured via .env file:
- `DB_HOST` - Database host (default: localhost)
- `DB_PORT` - Database port (default: 3306)
- `DB_USER` - Database user (default: root)
- `DB_PASSWORD` - Database password
- `DB_NAME` - Database name (default: kconnect)
- `PORT` - Server port (default: 3000, Railway auto-assigns port in production)
- `NODE_ENV` - Environment mode (development/production)
- `DOMAIN` - Base URL for file paths (default: http://localhost:3000)

**Connection Pattern**: Single MySQL connection created on startup via `mysql2/promise`

**Environment Configuration**:
- **Local Development**: Uses `.env` file with localhost database
- **Production (Railway)**: Uses environment variables set in Railway dashboard
  - Railway Variables override local `.env` file
  - Database uses private network (`mysql.railway.internal` or `mysql`)
  - PORT is dynamically assigned by Railway
  - Server listens on `0.0.0.0` for external access

## API Endpoints

### General
- `GET /` - Root endpoint returning API information and available endpoints
- `GET /health` - Health check endpoint
- `GET /api/test` - Test endpoint returning API status and timestamp

### Test Data & Table Creation
- `GET /api/test-data/insert_data` - Insert random data into test_list table
- `GET /api/test-data/list_data` - Fetch all data from test_list table
- `GET /api/test-data/create_news_attachment` - Create news_attachment table
- `GET /api/test-data/create_bill_attachment` - Create bill_attachment table
- `GET /api/test-data/create_app_config` - Create and initialize app_config table
- `GET /api/test-data/create_room_information` - Create room_information table
- `GET /api/test-data/create_member_information` - Create member_information table
- `GET /api/test-data/create_bill_information` - Create bill_information table
- `GET /api/test-data/create_bill_room_information` - Create bill_room_information table
- `GET /api/test-data/create_bill_type_information` - Create bill_type_information table
- `GET /api/test-data/create_bill_audit` - Create bill_audit_information table
- `GET /api/test-data/create_payment_information` - Create payment_information table
- `GET /api/test-data/create_payment_attachment` - Create payment_attachment table
- `GET /api/test-data/create_payment_type_information` - Create payment_type_information table with default data
- `GET /api/test-data/create_bill_transaction_information` - Create bill_transaction_information table
- `GET /api/test-data/create_bill_transaction_type_information` - Create bill_transaction_type_information table with default data

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

### Bill API
- `POST /api/bill/insert` - Insert bill (requires: upload_key, title, bill_type_id, detail, expire_date, customer_id, status, uid)
- `GET /api/bill/bill_excel_list` - Preview Excel bill data before import (requires: upload_key)
- `POST /api/bill/insert_with_excel` - Insert bill with Excel import (reads Excel from bill_attachment, creates bill + bill_room records, supports excluded_rows)
- `PUT /api/bill/update` - Update bill (requires: id, title, detail, expire_date, status, uid)
- `POST /api/bill/send` - Send bill (set status 0 or 3 to 1, set send_date) (requires: id, uid)
- `POST /api/bill/cancel_send` - Cancel sent bill (set status 1 to 3, remove send_date) (requires: id, uid)
- `DELETE /api/bill/delete` - Soft delete bill (set status=2)
- `GET /api/bill/list` - List bills with pagination (requires: customer_id)
- `GET /api/bill/{id}` - Get single bill by ID with bill_type details
- `GET /api/bill/bill_room_list` - List bill rooms with bill information (requires: customer_id, bill_id)
- `GET /api/bill/bill_room_each_list` - List bills for specific room with summary data (requires: house_no, customer_id)

### Bill Type API
- `GET /api/bill-type/list` - List bill types with pagination

### Bill Room API
- `POST /api/bill-room/insert` - Insert bill room (requires: bill_id, house_no, member_name, total_price, customer_id, status, uid)
- `GET /api/bill-room/list` - List bill rooms with pagination (requires: customer_id)

### Payment API
- `POST /api/payment/insert` - Insert payment (requires: upload_key, bill_room_id, payment_amount, payment_type_id, customer_id, status, member_id, uid)
- `PUT /api/payment/update` - Update payment (requires: ids, uid, status)
- `GET /api/payment/list` - List payments with pagination (requires: customer_id)
- `GET /api/payment/summary_status` - Get payment count summary by status (requires: customer_id)
- `GET /api/payment/{id}` - Get single payment detail by ID

### Payment Type API
- `GET /api/payment_type/list` - List payment types with pagination

### Bill Transaction API
- `POST /api/bill_transaction/insert` - Insert bill transaction (manual payment entry by admin)
- `GET /api/bill_transaction/bill_transaction_type` - Get bill transaction type list

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
- `customer_id` - VARCHAR(255) NOT NULL
- `status` - INT NOT NULL DEFAULT 1
- `create_date` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `create_by` - INT NOT NULL
- `update_date` - TIMESTAMP NULL
- `update_by` - INT NULL
- `delete_date` - TIMESTAMP NULL
- `delete_by` - INT NULL

**bill_information table:**
- `id` - INT AUTO_INCREMENT PRIMARY KEY
- `upload_key` - CHAR(32) NOT NULL
- `bill_no` - VARCHAR(50) NULL (auto-generated format: BILL-YYYY-MMDD-NNN)
- `title` - VARCHAR(255) NOT NULL
- `bill_type_id` - INT NOT NULL (references bill_type_information.id)
- `detail` - TEXT NOT NULL
- `expire_date` - TIMESTAMP NOT NULL
- `send_date` - TIMESTAMP NULL (auto-set when status=1)
- `remark` - TEXT NULL
- `customer_id` - VARCHAR(255) NOT NULL
- `status` - INT NOT NULL DEFAULT 1
- `create_date` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `create_by` - INT NOT NULL
- `update_date` - TIMESTAMP NULL
- `update_by` - INT NULL
- `delete_date` - TIMESTAMP NULL
- `delete_by` - INT NULL

**bill_type_information table:**
- `id` - INT AUTO_INCREMENT PRIMARY KEY
- `upload_key` - CHAR(32) NOT NULL
- `title` - VARCHAR(255) NOT NULL
- `status` - INT NOT NULL DEFAULT 1
- `create_date` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `create_by` - INT NOT NULL
- `update_date` - TIMESTAMP NULL
- `update_by` - INT NULL
- `delete_date` - TIMESTAMP NULL
- `delete_by` - INT NULL

**bill_room_information table:**
- `id` - INT AUTO_INCREMENT PRIMARY KEY
- `bill_id` - INT NOT NULL (references bill_information.id)
- `bill_no` - VARCHAR(50) NOT NULL (auto-generated format: INV-YYYY-MMDD-NNN)
- `house_no` - VARCHAR(50) NOT NULL
- `member_name` - VARCHAR(255) NOT NULL
- `total_price` - DECIMAL(10,2) NOT NULL
- `remark` - TEXT NULL
- `customer_id` - VARCHAR(255) NOT NULL
- `status` - INT NOT NULL DEFAULT 1
- `create_date` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `create_by` - INT NOT NULL
- `update_date` - TIMESTAMP NULL
- `update_by` - INT NULL
- `delete_date` - TIMESTAMP NULL
- `delete_by` - INT NULL

**bill_audit_information table (audit trail):**
- `id` - INT AUTO_INCREMENT PRIMARY KEY
- `bill_id` - INT NOT NULL (references bill_information.id)
- `status` - INT NOT NULL (status value: 0=Draft, 1=Sent, 2=Deleted, 3=Canceled)
- `create_date` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `create_by` - INT NOT NULL

**payment_information table (Polymorphic Association):**
- `id` - INT AUTO_INCREMENT PRIMARY KEY
- `upload_key` - CHAR(32) NOT NULL
- `payable_type` - VARCHAR(50) NOT NULL (e.g., 'bill_room_information', 'fine_information')
- `payable_id` - INT NOT NULL (references id in payable_type table)
- `payment_amount` - DOUBLE NOT NULL
- `payment_type_id` - INT NOT NULL
- `customer_id` - VARCHAR(255) NOT NULL
- `status` - INT NOT NULL DEFAULT 1 (0=Pending approval, 1=Approved, 2=Deleted, 3=Rejected)
- `member_id` - INT NOT NULL
- `remark` - TEXT NULL
- `create_date` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `create_by` - INT NOT NULL
- `update_date` - TIMESTAMP NULL
- `update_by` - INT NULL
- `delete_date` - TIMESTAMP NULL
- `delete_by` - INT NULL
- `INDEX idx_payable (payable_type, payable_id)` - Composite index for performance

**payment_attachment table:**
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

**payment_type_information table:**
- `id` - INT AUTO_INCREMENT PRIMARY KEY
- `upload_key` - CHAR(32) NOT NULL
- `title` - VARCHAR(255) NOT NULL
- `detail` - TEXT NOT NULL
- `status` - INT NOT NULL DEFAULT 1
- `create_date` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `create_by` - INT NOT NULL
- `update_date` - TIMESTAMP NULL
- `update_by` - INT NULL
- `delete_date` - TIMESTAMP NULL
- `delete_by` - INT NULL
- Default data: 1=Mobile Banking (ชำระผ่านแอปธนาคาร, status=0), 2=โอนผ่านธนาคาร (โอนเงินแล้วแนบสลิป, status=1), 3=ชำระที่นิติบุคคล (ชำระกับทางนิติบุคคลโดยตรง, status=0)

**bill_transaction_information table (Transaction log for all bill payments):**
- `id` - INT AUTO_INCREMENT PRIMARY KEY
- `bill_room_id` - INT NOT NULL (references bill_room_information.id)
- `payment_id` - INT NULL (references payment_information.id, NULL if manual entry by admin)
- `transaction_amount` - DECIMAL(10,2) NOT NULL
- `bill_transaction_type_id` - INT NULL (references bill_transaction_type_information.id, NULL if from payment approval)
- `transaction_type_json` - JSON NULL (additional payment method details)
- `transaction_date` - TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP (when transaction recorded)
- `pay_date` - TIMESTAMP NOT NULL (actual payment date)
- `transaction_type` - ENUM('full', 'partial') NOT NULL DEFAULT 'full'
- `remark` - TEXT NULL
- `customer_id` - VARCHAR(50) NOT NULL
- `status` - INT NOT NULL DEFAULT 1
- `create_date` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `create_by` - INT NOT NULL
- `update_date` - TIMESTAMP NULL
- `update_by` - INT NULL
- `delete_date` - TIMESTAMP NULL
- `delete_by` - INT NULL
- Indexes: idx_bill_room_id, idx_payment_id, idx_customer_id, idx_pay_date
- **Logic**:
  - Manual entry (admin): payment_id=NULL, bill_transaction_type_id=INT (required)
  - System approved: payment_id=INT, bill_transaction_type_id=NULL
  - Partial payment tracking: Sum of transaction_amount determines bill_room_information.status
  - Automatic status update: newTotalPaid >= totalPrice → status=1 (paid), otherwise status=4 (partial)

**bill_transaction_type_information table:**
- `id` - INT AUTO_INCREMENT PRIMARY KEY
- `upload_key` - CHAR(32) NOT NULL
- `title` - VARCHAR(255) NOT NULL
- `status` - INT NOT NULL DEFAULT 1
- `create_date` - TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `create_by` - INT NOT NULL
- `update_date` - TIMESTAMP NULL
- `update_by` - INT NULL
- `delete_date` - TIMESTAMP NULL
- `delete_by` - INT NULL
- Default data: 1=เงินสด, 2=โอนเงินธนาคาร, 3=เช็ค, 4=บัตรเครดิต, 5=อื่นๆ

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

**Bill API:**
- **Insert**: `{upload_key, title, bill_type_id, detail, expire_date, customer_id, status, uid, remark?}` via `/api/bill/insert`
  - Required: upload_key, title, bill_type_id, detail, expire_date, customer_id, status, uid
  - Optional: remark
  - Note: send_date is auto-set to current date when status=1
- **Preview Excel/CSV**: `?upload_key=xxx` via `/api/bill/bill_excel_list`
  - Required: upload_key
  - Supports: .xlsx, .xls, .csv files
  - Returns Excel/CSV data preview with validation status (no pagination)
  - Response includes formatted summary: total_rows, valid_rows, invalid_rows, total_price (with comma formatting)
  - Each item includes: row_number, house_no, member_name, total_price, remark, status (1=valid, 0=invalid)
  - Status 0 items include error_message field
  - Number formatting: comma-separated (e.g., "1,000"), total_price with ฿ prefix
  - Decimal formatting: shows .00 only if not integer (e.g., "฿8,300" vs "฿8,300.50")
- **Insert with Excel/CSV**: `{upload_key, title, bill_type_id, detail, expire_date, customer_id, status, uid, excluded_rows?}` via `/api/bill/insert_with_excel`
  - Required: upload_key, title, bill_type_id, detail, expire_date, customer_id, status, uid
  - Optional: excluded_rows (array of row_number to skip)
  - Supports: .xlsx, .xls, .csv files
  - Reads Excel/CSV file from bill_attachment table using upload_key
  - File must contain columns: เลขห้อง, ชื่อลูกบ้าน, ยอดเงิน (required), หมายเหตุ (optional)
  - Auto-generates bill_no for bill_information (format: BILL-YYYY-MMDD-NNN, per customer_id)
  - Auto-generates bill_no for each bill_room_information (format: INV-YYYY-MMDD-NNN, per customer_id)
  - Creates bill_information + batch inserts bill_room_information with remark
  - Uses transaction for data consistency
  - Uses FOR UPDATE lock to prevent race condition on bill_no generation
  - Bill number resets daily based on date pattern (MMDD)
  - Skips rows with missing required fields (เลขห้อง, ชื่อลูกบ้าน, or ยอดเงิน)
  - Skips rows in excluded_rows array (user-selected rows to exclude)
  - excluded_rows supports multiple formats: JSON array `[2,4]`, string `"2,4"`, or `"[2,4]"` (form-data compatible)
  - Returns summary with: bill_id, bill_no, total_rooms_inserted, total_rows_excluded, total_rows_skipped
- **Update**: `{id, title, detail, expire_date, status, uid, remark?}` via `/api/bill/update`
  - Required: id, title, detail, expire_date, status, uid
  - Optional: remark
  - Note: send_date is set to current date if status changes to 1 and send_date is null
- **Send**: `{id, uid}` via `/api/bill/send`
  - Required: id, uid
  - Updates status from 0 or 3 to 1 (Draft/Canceled → Sent)
  - Sets send_date to current timestamp
  - Logs status change in bill_audit_information table
- **Cancel Send**: `{id, uid}` via `/api/bill/cancel_send`
  - Required: id, uid
  - Updates status from 1 to 3 (Sent → Canceled)
  - Removes send_date (sets to NULL)
  - Logs status change in bill_audit_information table
- **Delete**: `{id, uid}` via `/api/bill/delete`
- **List**: `?page=1&limit=10&status=1&keyword=search&bill_type_id=1&customer_id=xxx` via `/api/bill/list`
  - Required: customer_id
  - Optional: page, limit, status, keyword, bill_type_id
  - Returns: bill_no, bill_type_title, total_room (count), total_price (formatted with ฿ and comma)
  - Keyword search includes: title, detail, and dates (expire_date, send_date, create_date in DD/MM/YYYY format)
- **Detail**: `/api/bill/{id}` - Returns bill with bill_type details joined
  - Returns: bill_no, bill_type_title, total_room (count), total_price (formatted with ฿ and comma)
- **Bill Room List**: `?page=1&limit=10&customer_id=xxx&bill_id=1` via `/api/bill/bill_room_list`
  - Required: customer_id, bill_id
  - Optional: page, limit
  - Returns bill information with bill_type details and paginated list of bill_room_information
  - Response includes: bill_info object with bill_type_id, bill_type_title, and items array
- **Bill Room Each List**: `?page=1&limit=10&house_no=xxx&customer_id=xxx` via `/api/bill/bill_room_each_list`
  - Required: house_no, customer_id
  - Optional: page, limit
  - Returns summary data and paginated list of bills for specific room (only sent bills with bill_information.status = 1)
  - Response structure:
    - summary_data: pending_amount (count of status=0), payment_completion (format: "3/5 ครั้ง (60%)"), next_payment_date (earliest expire_date of pending bills, format: DD/MM/YYYY)
    - items: expire_date (DD/MM/YYYY), bill_no, bill_title, total_price (฿ formatted), status (dynamic: 0→3 if overdue)
  - Order by: expire_date DESC (newest expire_date first)
  - Filter: Only shows bills where bill_information.status = 1 (sent bills only)
  - Dynamic status: If status=0 and current_date > expire_date, returns status=3 (overdue)

**Bill Type API:**
- **List**: `?page=1&limit=100&status=1&keyword=search` via `/api/bill-type/list`
  - All parameters optional
  - Default limit: 100

**Bill Room API:**
- **Insert**: `{bill_id, house_no, member_name, total_price, customer_id, status, uid, remark?}` via `/api/bill-room/insert`
  - Required: bill_id, house_no, member_name, total_price, customer_id, status, uid
  - Optional: remark
  - Note: bill_no is auto-generated (format: INV-YYYY-MMDD-NNN)
- **List**: `?page=1&limit=10&status=1&keyword=search&bill_id=1&customer_id=xxx` via `/api/bill-room/list`
  - Required: customer_id
  - Optional: page, limit, status, keyword, bill_id
  - Response includes: remark field

**Payment API:**
- **Insert**: `{upload_key, payable_type, payable_id, payment_amount, payment_type_id, customer_id, status, member_id, uid, remark?}` via `/api/payment/insert`
  - Required: upload_key, payable_type, payable_id, payment_amount, payment_type_id, customer_id, status, member_id, uid
  - Optional: remark
  - payment_amount is DOUBLE type
  - Uses Polymorphic Association: payable_type + payable_id (e.g., payable_type='bill_room_information', payable_id=19)
  - Validation: Checks if payment_attachment exists with status=1 before insert (requires payment slip)
- **Update**: `{ids, uid, status, remark?}` via `/api/payment/update`
  - Required: ids (array of integers), uid, status
  - Optional: remark (required if status=3)
  - Status validation: Must be 1 or 3 only (1 = Approved, 3 = Rejected)
  - Bulk update support: Can update single or multiple payments in one request
  - Single update: `{"ids": [1], "uid": 123, "status": 1}`
  - Multiple update: `{"ids": [1,2,3,4], "uid": 123, "status": 1}`
  - Rejection with same remark: All rejected items share the same remark value
  - Only allows updating payments with current status = 0 (pending approval)
  - Uses transaction with FOR UPDATE lock for data consistency
  - Returns detailed results:
    - total: Total number of IDs submitted
    - success_count: Number of successfully updated items
    - failed_count: Number of failed items
    - success_items: Array of successfully updated items with ID, status, remark
    - failed_items: Array of failed items with ID and reason
  - Validation errors (returns error immediately):
    - ids is not an array or empty
    - status is not 1 or 3
    - status=3 without remark
  - Item-level failures (continues processing, returns in failed_items):
    - Payment not found
    - Payment status is not 0 (already processed)
- **List**: `?page=1&limit=10&status=1&keyword=search&customer_id=xxx&amount_range=1&date_range=1` via `/api/payment/list`
  - Required: customer_id
  - Optional: page, limit, status, keyword, amount_range, date_range
  - Keyword search includes: bill_no, room title (เลขห้อง), member full_name (ไม่รวม prefix), bill_title, house_no
  - Amount range filter (payment_amount):
    - 1 = ทุกจำนวนเงิน (no filter)
    - 2 = น้อยกว่า 1,000
    - 3 = 1,000-3,000
    - 4 = มากกว่า 3,000
  - Date range filter (create_date):
    - 1 = ทั้งหมด (all, no filter)
    - 2 = วันนี้ (today)
    - 3 = 7 วันล่าสุด (last 7 days)
    - 4 = เดือนนี้ (this month)
  - Response includes joined data:
    - member_name (prefix_name + full_name, e.g., "นายสมชาย")
    - member_real_name (full_name only, excluding prefix, e.g., "สมชาย")
    - member_detail (room_title + " | " + phone_number)
    - bill_no, house_no, bill_total_price, bill_title
    - payment_type_title, payment_type_detail
    - remark (optional text field)
  - payment_amount and bill_total_price are formatted with ฿ prefix
- **Summary Status**: `?customer_id=xxx` via `/api/payment/summary_status`
  - Required: customer_id
  - Returns count of payments by tab:
    - tab1: Fixed value (99)
    - tab2: Pending approval count (status=0)
    - tab3: Approved count (status=1)
    - tab4: Rejected count (status=3)
  - Excludes deleted records (status=2)
  - Returns 0 if no records found for tab2/tab3/tab4
- **Detail**: `/api/payment/{id}` - Get single payment by ID
  - Returns complete payment information with joined data:
    - Payment information: id, upload_key, payable_type, payable_id, payment_amount, payment_type_id, customer_id, status, member_id, remark
    - Member information: member_name, member_real_name, prefix_name, phone_number, email, member_detail, room_title
    - Bill room information (if payable_type='bill_room_information'): bill_no, house_no, bill_total_price
    - Bill information (if payable_type='bill_room_information'): bill_id, bill_title, bill_type_id, bill_type_title, expire_date, send_date
    - Payment type information: payment_type_title, payment_type_detail
    - Audit fields: create_date, create_by, update_date, update_by, delete_date, delete_by
  - All date fields formatted with _formatted suffix (DD/MM/YYYY HH:mm:ss)
  - payment_amount and bill_total_price formatted with ฿ prefix
  - Uses Polymorphic Association: LEFT JOIN based on payable_type and payable_id
  - Returns 404 if payment not found or deleted (status=2)

**Payment Type API:**
- **List**: `?page=1&limit=100&status=1&keyword=search` via `/api/payment_type/list`
  - All parameters optional
  - Default limit: 100
  - Keyword search includes: title, detail

**Bill Transaction API:**
- **Insert**: `{bill_room_id, bill_transaction_type_id, transaction_amount, pay_date, transaction_type_json?, remark?, customer_id, uid}` via `/api/bill_transaction/insert`
  - Required: bill_room_id, bill_transaction_type_id, transaction_amount, pay_date, customer_id, uid
  - Optional: transaction_type_json (JSON object with additional payment details), remark
  - transaction_amount is DECIMAL(10,2)
  - bill_transaction_type_id must exist in bill_transaction_type_information table
  - Automatically determines transaction_type (full/partial) based on total paid vs total price
  - Automatically updates bill_room_information.status (4=partial payment, 1=paid)
  - Returns summary with: transaction data, bill_room_status, total_paid, total_price, remaining
  - Example transaction_type_json for cash (ID=1):
    ```json
    {
      "bill_transaction_type_id": 1,
      "received_by": "แม่บ้าน สมหญิง",
      "receipt_no": "CASH-20251024-001"
    }
    ```
  - Example transaction_type_json for bank transfer (ID=2):
    ```json
    {
      "bill_transaction_type_id": 2,
      "bank_name": "ธนาคารกสิกรไทย",
      "account_number": "xxx-x-xxxxx-x",
      "transfer_date": "2025-10-24 14:30:00",
      "reference_no": "TRF202510240001"
    }
    ```
- **Bill Transaction Type List**: No parameters via `/api/bill_transaction/bill_transaction_type`
  - Returns all active transaction types (status != 2)
  - Default data: 1=เงินสด, 2=โอนเงินธนาคาร, 3=เช็ค, 4=บัตรเครดิต, 5=อื่นๆ

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

**Bill List Filters:**
- **Search**: `keyword` - searches in title, detail, and dates (LIKE %keyword%)
  - Searches in: title, detail
  - Date search: expire_date, send_date, create_date (format: DD/MM/YYYY)
  - Example: keyword="12" searches for day 12, keyword="2025" searches for year 2025
- **Bill Type**: `bill_type_id` - filter by bill type ID (0 = all types)
- **Customer**: `customer_id` - REQUIRED - filter by customer ID
- **Status**: `status` - filter by status (default: excludes deleted records with status=2)
- **Pagination**: `page`, `limit` - standard pagination
- **Joined Data**: Returns bill_no, bill_type_title, total_room (count), total_price (formatted with ฿)

**Bill Type List Filters:**
- **Search**: `keyword` - searches in title (LIKE %keyword%)
- **Status**: `status` - filter by status (default: excludes deleted records with status=2)
- **Pagination**: `page`, `limit` - standard pagination (default limit: 100)

**Bill Room List Filters:**
- **Search**: `keyword` - searches in bill_no, house_no, member_name (LIKE %keyword%)
- **Bill**: `bill_id` - filter by bill ID (0 = all bills)
- **Customer**: `customer_id` - REQUIRED - filter by customer ID
- **Status**: `status` - filter by status (default: excludes deleted records with status=2)
- **Pagination**: `page`, `limit` - standard pagination

**Payment List Filters:**
- **Search**: `keyword` - searches in bill_no, room title (เลขห้อง from member_detail), member full_name (excluding prefix), bill_title, house_no (LIKE %keyword%)
- **Customer**: `customer_id` - REQUIRED - filter by customer ID
- **Status**: `status` - filter by status (default: excludes deleted records with status=2)
- **Amount Range**: `amount_range` - filter by payment_amount (1=all, 2=<1000, 3=1000-3000, 4=>3000)
- **Date Range**: `date_range` - filter by create_date (1=all, 2=today, 3=last 7 days, 4=this month)
- **Pagination**: `page`, `limit` - standard pagination
- **Joined Data**:
  - member_name (CONCAT of prefix_name + full_name, e.g., "นายสมชาย")
  - member_real_name (full_name only, excluding prefix, e.g., "สมชาย")
  - member_detail (CONCAT of room_title + " | " + phone_number)
  - bill_no, house_no, bill_total_price, bill_title
  - payment_type_title, payment_type_detail
- **Price Formatting**: payment_amount and bill_total_price formatted with ฿ prefix

**Payment Type List Filters:**
- **Search**: `keyword` - searches in title, detail (LIKE %keyword%)
- **Status**: `status` - filter by status (default: excludes deleted records with status=2)
- **Pagination**: `page`, `limit` - standard pagination (default limit: 100)

### Date Formatting

All list and detail endpoints return dates in two formats:
- **ISO Format**: Original timestamp field (e.g., `create_date: "2025-10-08T09:27:32.000Z"`)
- **Formatted Date**: Formatted field with `_formatted` suffix (e.g., `create_date_formatted: "08/10/2025 16:27:32"`)

**Formatted Date Fields**:
- Format: `DD/MM/YYYY HH:mm:ss` (Gregorian calendar)
- Uses standard date formatting with leading zeros
- Example: `"08/10/2025 16:27:32"` for October 8, 2025
- Automatically applied to: `create_date`, `update_date`, `delete_date`, `enter_date` (member only), `expire_date`, `send_date` (bill only)

**Implementation**:
```javascript
import { addFormattedDates, addFormattedDatesToList } from '../utils/dateFormatter.js';

// For single record
const formattedRecord = addFormattedDates(record);

// For list of records
const formattedRows = addFormattedDatesToList(rows);

// Specify which date fields to format (default: create_date, update_date, delete_date)
const formattedRows = addFormattedDatesToList(rows, ['create_date', 'update_date', 'delete_date', 'enter_date']);
```

### Number Formatting

Number and currency formatting utilities available in `utils/numberFormatter.js`:

**Functions**:
- `formatNumber(num)` - Adds comma separators (e.g., "1,000")
- `formatPrice(num)` - Formats as currency with ฿ prefix and smart decimal display

**Smart Decimal Display**:
- Integer values: `"฿1,500"` (no decimal places)
- Decimal values: `"฿1,200.06"` (shows 2 decimal places)

**Implementation**:
```javascript
import { formatNumber, formatPrice } from '../utils/numberFormatter.js';

const formatted = formatNumber(1000);  // "1,000"
const price = formatPrice(1500);       // "฿1,500"
const priceDecimal = formatPrice(1200.06);  // "฿1,200.06"
```

**Usage**:
- Used in Bill API responses for `total_price` field
- Used in Excel preview API for summary fields

### File Upload Support

- **Multiple Files**: Support multiple file uploads via form-data
- **File Types**: Default: jpeg, jpg, png, gif, pdf, doc, docx, txt, zip, rar, xlsx, xls, csv (configurable via `app_config.allowed_file_types`)
- **Size Limit**: Default: 10MB per file (configurable via `app_config.max_file_size`)
- **File Count Limit**: Default: 5 files per upload_key (configurable via `app_config.max_file_count`)
- **Storage Options**: Supports both Firebase Storage and local project storage
  - **Firebase Mode** (`UPLOAD_TYPE=firebase`): Files uploaded to Firebase Storage with public URLs
  - **Project Mode** (`UPLOAD_TYPE=project`): Files stored locally in `uploads/{menu}/` directory
  - **Smart URL Building**: Automatically detects Firebase URLs vs local paths for correct URL formatting
- **Dynamic Storage**: Files organized by menu/module name
- **Table Auto-Detection**: Uses `{menu}_attachment` table structure
- **Thai Filename Support**: Automatically handles Thai characters in filenames from both Postman (UTF-8) and browsers (latin1 encoding)
- **Validation**:
  - Checks table existence before upload
  - Validates file size, type, and total file count
  - Counts existing files for upload_key before allowing new uploads
- **File URL**: Returns full URL (Firebase public URL or DOMAIN + local path)
- **Soft Delete Behavior**:
  - Deleting files only marks them as deleted in database (status=2)
  - **Files are kept in storage** (Firebase or local) as backup for recovery
  - No physical file deletion occurs on soft delete operations

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
- **Transaction Support**: Excel/CSV import uses MySQL transactions for data consistency
- **Auto-Generated Fields**:
  - `bill_information.bill_no` - Auto-generated bill number (format: BILL-YYYY-MMDD-NNN, per customer_id)
  - `bill_room_information.bill_no` - Auto-generated invoice number (format: INV-YYYY-MMDD-NNN, per customer_id)
  - `send_date` - Auto-set to current timestamp when bill status changes to 1
  - Bill numbers reset daily based on date pattern (MMDD)
- **Race Condition Protection**:
  - Uses `FOR UPDATE` row locking in transactions to prevent duplicate bill_no
  - Safe for concurrent requests from multiple users with same customer_id
  - Ensures sequential bill_no generation even under high load
- **Bill Status Workflow**:
  - Status meanings: 0=Draft (not sent), 1=Sent (active), 2=Deleted (soft delete), 3=Canceled (was sent, then canceled)
  - Valid status transitions: 0→1 (send), 1→3 (cancel_send), 3→1 (resend), any→2 (delete)
  - All status changes are logged in bill_audit_information table for audit trail
  - Helper function `insertBillAudit()` centralizes logging logic across all bill operations
  - Status logs recorded on: insert, update (if status changed), send, cancel_send, delete, import from Excel
- **Payment Status Workflow**:
  - Status meanings: 0=Pending approval (awaiting admin review), 1=Approved (payment accepted), 2=Deleted (soft delete), 3=Rejected (payment declined)
  - Update restrictions: Only payments with status=0 can be updated (pending approval only)
  - Approval process: Admin updates status from 0→1 (approve) or 0→3 (reject)
  - Status validation: Update API only accepts status values 1 or 3 (cannot update to 0, 2, or other values)
  - Rejection requirement: When setting status=3, remark field is required to provide reason for rejection
  - Approved/Rejected payments: Cannot be updated again, member must submit new payment notification if rejected
- **Excel/CSV Import**: Bill system supports importing bill_room data from Excel/CSV files with validation and preview
  - **Preview Flow** (GET /api/bill/bill_excel_list):
    - Step 1: Upload Excel/CSV via `/api/upload_file` (menu=bill) → get upload_key
    - Step 2: Call preview API with upload_key → get validated list with status indicators
    - Step 3: Frontend displays preview with "ลำดับ, เลขห้อง, ชื่อลูกบ้าน, ยอดเงิน, หมายเหตุ, สถานะ, จัดการ" columns
    - Step 4: User can remove rows (valid or invalid) → collect excluded row_numbers
    - Step 5: Call insert API with excluded_rows parameter
  - **File Format**:
    - Supported types: .xlsx, .xls, .csv
    - CSV encoding: UTF-8 (automatically detected and handled)
    - Required columns: เลขห้อง, ชื่อลูกบ้าน, ยอดเงิน
    - Optional columns: หมายเหตุ
  - **Storage Compatibility**:
    - Supports reading Excel/CSV from both Firebase Storage URLs and local file paths
    - Automatically detects file location and uses appropriate reading method
    - Firebase: Downloads file via HTTP/HTTPS before parsing
    - Local: Reads directly from filesystem
    - Works seamlessly with `UPLOAD_TYPE` environment setting
  - **Validation**:
    - Validates file type (.xlsx, .xls, .csv)
    - Detects and rejects HTML-based .xls files (must be native Excel format)
    - Row-by-row validation: marks rows as status=0 (invalid) or status=1 (valid)
    - Invalid rows show error_message, valid rows can still be excluded by user
    - Missing data displayed as "ไม่ระบุ", missing remark displayed as "-"
  - **Preview Response Formatting**:
    - Numbers formatted with comma separator (e.g., "1,000")
    - total_price with ฿ prefix and smart decimal display (e.g., "฿8,300" or "฿8,300.50")
    - Summary includes: total_rows, valid_rows, invalid_rows, total_price (sum of valid rows only)
  - **Insert Features**:
    - Auto-generates bill_no for bill_information (BILL-YYYY-MMDD-NNN)
    - Auto-generates bill_no for each bill_room_information (INV-YYYY-MMDD-NNN)
    - Supports excluded_rows parameter (JSON array, string "2,4", or "[2,4]" for form-data)
    - Skips rows in excluded_rows (user-removed items from preview)
    - Skips rows with missing required fields automatically
    - Batch insert for performance (1 query for multiple rows)
    - Transaction rollback on error
    - Returns summary: bill_id, bill_no, total_rooms_inserted, total_rows_excluded, total_rows_skipped

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
# Software Requirements Specification (SRS)
## KConnect Common Fee API

**Version:** 1.0
**Last Updated:** December 2025
**Project:** K-Connect Common Fee Management System

---

## 1. Project Overview

### 1.1 Purpose
KConnect API เป็นระบบจัดการค่าใช้จ่ายส่วนกลางสำหรับนิติบุคคล/หมู่บ้านจัดสรร ที่ให้บริการจัดการบิล, การชำระเงิน, สมาชิก, และห้องพัก พร้อมระบบแจ้งเตือนผ่าน Firebase

### 1.2 Scope
- จัดการข้อมูลบิลค่าใช้จ่ายและส่งแจ้งเตือนให้สมาชิก
- รับและอนุมัติการชำระเงินจากสมาชิก
- จัดการข้อมูลห้องพัก, สมาชิก, ธนาคาร
- Import ข้อมูลบิลจาก Excel/CSV
- สร้างใบแจ้งหนี้ (Invoice) แบบ PDF
- Dashboard และรายงานสรุปต่างๆ
- ส่งการแจ้งเตือนผ่าน Firebase Cloud Messaging (FCM)

### 1.3 Target Users
- **Admin/Staff**: จัดการระบบ, อนุมัติการชำระเงิน, ออกบิล
- **Members**: ดูบิล, แจ้งชำระเงิน, ดูประวัติการชำระเงิน

---

## 2. System Architecture

### 2.1 Technology Stack
- **Backend Framework**: Node.js + Express.js (ES6 Modules)
- **Database**: MySQL (mysql2 driver)
- **Authentication**: JWT (Portal SSO Integration)
- **File Storage**: Firebase Storage + Local Storage (configurable)
- **Push Notification**: Firebase Cloud Messaging (FCM)
- **Logging**: Winston (daily file rotation)
- **Excel Processing**: xlsx + ExcelJS libraries
- **PDF Generation**: HTML-based invoice rendering

### 2.2 Architecture Pattern
- **MVC Pattern**: Controllers, Routes, Middleware
- **Feature-based Structure**: แยกโฟลเดอร์ตาม feature
- **Database-driven Config**: Runtime configuration via app_config table
- **Polymorphic Associations**: payment_information support multiple payable types

### 2.3 Key Components
```
┌─────────────────┐
│   Client App    │ (Web/Mobile)
└────────┬────────┘
         │ JWT + customer_id
         ▼
┌─────────────────────────────────┐
│   Express.js REST API           │
│  ┌──────────────────────────┐  │
│  │  Authentication          │  │
│  │  (Portal SSO + JWT)      │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │  Business Logic          │  │
│  │  (Controllers)           │  │
│  └──────────────────────────┘  │
│  ┌──────────────────────────┐  │
│  │  File Upload Manager     │  │
│  │  (Firebase/Local)        │  │
│  └──────────────────────────┘  │
└────────┬────────────────────────┘
         │
    ┌────┴─────┬──────────┬────────────┐
    ▼          ▼          ▼            ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌──────────┐
│ MySQL  │ │Firebase│ │Firebase│ │  Portal  │
│   DB   │ │Storage │ │  FCM   │ │ SSO API  │
└────────┘ └────────┘ └────────┘ └──────────┘
```

---

## 3. Functional Requirements

### 3.1 Authentication & Authorization (FR-AUTH)
- **FR-AUTH-01**: Portal SSO Login - ผู้ใช้ login ผ่าน Portal และได้รับ JWT token
- **FR-AUTH-02**: JWT Validation - ตรวจสอบ JWT ทุก request (ยกเว้น login)
- **FR-AUTH-03**: Customer Access Control - ตรวจสอบสิทธิ์การเข้าถึง customer_id ผ่าน Portal API
- **FR-AUTH-04**: Token Expiration - JWT หมดอายุตามเวลาที่กำหนด (1-24 ชม.)

### 3.2 Bill Management (FR-BILL)
- **FR-BILL-01**: Create Bill - สร้างบิลค่าใช้จ่าย (manual หรือ Excel import)
- **FR-BILL-02**: Excel Import - Import รายการบิลจาก Excel/CSV พร้อม preview และ validation
- **FR-BILL-03**: Send Bill - ส่งบิลให้สมาชิก (status: Draft → Sent)
- **FR-BILL-04**: Cancel Bill - ยกเลิกบิลที่ส่งแล้ว (status: Sent → Canceled)
- **FR-BILL-05**: Auto Bill Number - สร้างเลขที่บิลอัตโนมัติ (BILL-YYYY-MMDD-NNN, INV-YYYY-MMDD-NNN)
- **FR-BILL-06**: Bill Audit Trail - บันทึกประวัติการเปลี่ยนสถานะบิล
- **FR-BILL-07**: Bill Summary - สรุปข้อมูลบิลทั้งหมด (total, paid, pending, overdue)
- **FR-BILL-08**: Generate Invoice PDF - สร้างใบแจ้งหนี้ PDF พร้อม QR Code

### 3.3 Payment Management (FR-PAY)
- **FR-PAY-01**: Submit Payment - สมาชิกแจ้งชำระเงิน (พร้อมแนบสลิป)
- **FR-PAY-02**: Approve/Reject Payment - Admin อนุมัติหรือปฏิเสธการชำระเงิน
- **FR-PAY-03**: Partial Payment - รองรับการชำระเงินแบบเป็นงวด
- **FR-PAY-04**: Manual Transaction - Admin บันทึกการรับชำระเงินแบบ manual (เงินสด, โอน, ฯลฯ)
- **FR-PAY-05**: Payment History - ดูประวัติการชำระเงินของแต่ละห้อง/บิล
- **FR-PAY-06**: Payment Summary - สรุปสถานะการชำระเงิน (pending, approved, rejected)

### 3.4 Room & Member Management (FR-ROOM)
- **FR-ROOM-01**: Manage Rooms - CRUD ข้อมูลห้องพัก
- **FR-ROOM-02**: Manage Members - CRUD ข้อมูลสมาชิก (owner, tenant)
- **FR-ROOM-03**: Firebase Sync - Sync ข้อมูลห้องและสมาชิกจาก Firebase Firestore
- **FR-ROOM-04**: Room Summary - สรุปข้อมูลห้องและสมาชิก

### 3.5 News Management (FR-NEWS)
- **FR-NEWS-01**: Manage News - CRUD ข้อมูลข่าวสาร
- **FR-NEWS-02**: News Categories - จัดกลุ่มข่าวตามหมวดหมู่
- **FR-NEWS-03**: News Attachments - แนบไฟล์รูปภาพ/เอกสารกับข่าว

### 3.6 Bank Management (FR-BANK)
- **FR-BANK-01**: Manage Bank Accounts - CRUD ข้อมูลบัญชีธนาคาร
- **FR-BANK-02**: Single Active Bank - ต้องมีบัญชีธนาคาร active ได้เพียง 1 รายการต่อ customer
- **FR-BANK-03**: Bank Master List - ดึงข้อมูลธนาคารจาก Firebase master bank list

### 3.7 File Upload (FR-FILE)
- **FR-FILE-01**: Multi-file Upload - รองรับอัปโหลดหลายไฟล์พร้อมกัน
- **FR-FILE-02**: File Validation - ตรวจสอบประเภท, ขนาด, จำนวนไฟล์
- **FR-FILE-03**: Storage Options - รองรับ Firebase Storage และ Local Storage
- **FR-FILE-04**: Soft Delete - ลบไฟล์แบบ soft delete (เก็บไว้ใน storage)
- **FR-FILE-05**: Thai Filename Support - รองรับชื่อไฟล์ภาษาไทย

### 3.8 Notification System (FR-NOTIF)
- **FR-NOTIF-01**: Send Bill Notification - ส่งการแจ้งเตือนบิลให้สมาชิกผ่าน FCM
- **FR-NOTIF-02**: Send Payment Notification - แจ้งเตือนผลการอนุมัติ/ปฏิเสธการชำระเงิน
- **FR-NOTIF-03**: Notification Throttling - จำกัดการส่งการแจ้งเตือนซ้ำ (configurable interval)
- **FR-NOTIF-04**: Notification Audit - บันทึกประวัติการส่งการแจ้งเตือน

### 3.9 Dashboard & Reports (FR-DASH)
- **FR-DASH-01**: Summary Cards - แสดงสถิติสรุปหลัก (10 cards)
- **FR-DASH-02**: Billing Revenue Chart - กราฟเปรียบเทียบบิลกับรายรับจริง (6/12 เดือน)
- **FR-DASH-03**: Bill Status Breakdown - แสดงสัดส่วนบิล (paid/pending/overdue)
- **FR-DASH-04**: Payment Efficiency - คำนวณอัตราการชำระเงินเทียบกับเป้าหมาย
- **FR-DASH-05**: Action Items - รายการงานที่ต้องดำเนินการ (pending verification, overdue)

---

## 4. Non-Functional Requirements

### 4.1 Performance (NFR-PERF)
- **NFR-PERF-01**: Response Time - API response < 2 วินาที (ยกเว้น Excel import และ PDF generation)
- **NFR-PERF-02**: Concurrent Users - รองรับผู้ใช้พร้อมกัน 100+ users
- **NFR-PERF-03**: Database Optimization - ใช้ index และ query optimization

### 4.2 Security (NFR-SEC)
- **NFR-SEC-01**: JWT Authentication - ใช้ JWT สำหรับ authentication ทุก protected endpoint
- **NFR-SEC-02**: HTTPS Only - Production ใช้ HTTPS เท่านั้น
- **NFR-SEC-03**: Input Validation - Validate input ทุก endpoint
- **NFR-SEC-04**: SQL Injection Prevention - ใช้ prepared statements ทุกคำสั่ง SQL
- **NFR-SEC-05**: File Upload Security - จำกัดประเภทและขนาดไฟล์, validate file content

### 4.3 Reliability (NFR-REL)
- **NFR-REL-01**: Transaction Support - ใช้ database transaction สำหรับ critical operations
- **NFR-REL-02**: Error Handling - Centralized error handling middleware
- **NFR-REL-03**: Logging - Winston logger with daily rotation
- **NFR-REL-04**: Race Condition Protection - ใช้ FOR UPDATE lock สำหรับ bill_no generation

### 4.4 Scalability (NFR-SCALE)
- **NFR-SCALE-01**: Horizontal Scaling - รองรับ load balancing
- **NFR-SCALE-02**: Database Connection Pooling - mysql2 connection pool
- **NFR-SCALE-03**: Stateless API - ไม่เก็บ session state (ใช้ JWT)

### 4.5 Maintainability (NFR-MAINT)
- **NFR-MAINT-01**: Code Structure - MVC pattern with feature-based folders
- **NFR-MAINT-02**: Documentation - CLAUDE.md และ SRS.md
- **NFR-MAINT-03**: Version Control - Git with GitLab
- **NFR-MAINT-04**: Environment Config - .env file สำหรับ configuration

### 4.6 Usability (NFR-USE)
- **NFR-USE-01**: API Consistency - RESTful API design
- **NFR-USE-02**: Error Messages - Thai language error messages สำหรับ frontend
- **NFR-USE-03**: Date Format - DD/MM/YYYY HH:mm:ss (with _formatted suffix)
- **NFR-USE-04**: Number Format - Comma separator และ ฿ prefix

---

## 5. API Endpoints Summary

### Authentication
- `POST /api/auth/login` - Portal SSO login
- `GET /api/auth/verify` - Verify JWT token
- `GET /api/auth/customer_list` - Get accessible customers

### Bill Management
- `POST /api/bill/insert` - Create bill (manual)
- `POST /api/bill/insert_with_excel` - Create bill (Excel import)
- `GET /api/bill/bill_excel_list` - Preview Excel data
- `PUT /api/bill/update` - Update bill
- `POST /api/bill/send` - Send bill (Draft → Sent)
- `POST /api/bill/cancel_send` - Cancel bill (Sent → Canceled)
- `DELETE /api/bill/delete` - Soft delete bill
- `GET /api/bill/list` - List bills (paginated)
- `GET /api/bill/:id` - Get bill detail
- `GET /api/bill/bill_room_list` - List bill rooms by bill_id
- `GET /api/bill/bill_room_each_list` - List bills by house_no
- `GET /api/bill/get_summary_data` - Bill summary cards

### Bill Room Management
- `POST /api/bill-room/insert` - Create bill room
- `GET /api/bill-room/list` - List bill rooms
- `GET /api/bill_room/app_list` - App list (for mobile)
- `GET /api/bill_room/:id` - Get bill room detail
- `GET /api/bill_room/current_bill_room` - Get current bill
- `GET /api/bill_room/remain_summery` - Remaining amount summary
- `GET /api/bill_room/getInvoice` - Generate invoice PDF

### Payment Management
- `POST /api/payment/insert` - Submit payment
- `PUT /api/payment/update` - Approve/Reject payment (bulk support)
- `GET /api/payment/list` - List payments (with filters)
- `GET /api/payment/:id` - Get payment detail
- `GET /api/payment/summary_status` - Payment count by status
- `GET /api/payment/get_summary_data` - Payment summary cards

### Bill Transaction
- `POST /api/bill_transaction/insert` - Manual payment entry (admin)
- `GET /api/bill_transaction/:id` - Get transaction detail
- `GET /api/bill_transaction/bill_transaction_type` - Transaction type list

### Room & Member
- `POST /api/room/insert` - Create room
- `GET /api/room/list` - List rooms
- `POST /api/room/sync_from_firebase` - Sync from Firebase
- `POST /api/member/insert` - Create member
- `GET /api/member/list` - List members

### Bank
- `POST /api/bank/insert` - Create bank account (always status=0)
- `PUT /api/bank/update` - Update bank (validate single active)
- `GET /api/bank/list` - List banks (filter by is_web)
- `GET /api/bank/master_list` - Master bank list (from Firebase)
- `GET /api/bank/:id` - Get bank detail
- `DELETE /api/bank/delete` - Soft delete bank

### News
- `POST /api/news/insert` - Create news
- `PUT /api/news/update` - Update news
- `DELETE /api/news/delete` - Soft delete news
- `GET /api/news/list` - List news (with category filter)
- `GET /api/news/:id` - Get news detail
- `POST /api/news/insert_category` - Create category
- `PUT /api/news/update_category` - Update category
- `DELETE /api/news/delete_category` - Delete category
- `GET /api/news/list_category` - List categories

### Dashboard
- `GET /api/dashboard/summary` - Summary statistics (10 cards)
- `GET /api/dashboard/billing_revenue` - Billing vs revenue chart
- `GET /api/dashboard/bill_status` - Bill status breakdown
- `GET /api/dashboard/payment_efficiency` - Payment efficiency stats
- `GET /api/dashboard/action_items` - Action items list

### File Upload
- `POST /api/upload_file` - Upload files (multi-file support)
- `DELETE /api/delete_file` - Soft delete file

### Configuration
- `GET /api/app_config/list` - List app configs
- `PUT /api/app_config/update` - Update config
- `GET /api/app_customer_config/list` - List customer configs
- `PUT /api/app_customer_config/update` - Update customer config

---

## 6. Database Schema Summary

### Core Tables
- **bill_information** - บิลค่าใช้จ่าย (with bill_no auto-generation)
- **bill_room_information** - รายการบิลแต่ละห้อง (with INV-xxx bill_no)
- **bill_type_information** - ประเภทบิล (ค่าส่วนกลาง, ค่าน้ำ, ฯลฯ)
- **bill_audit_information** - ประวัติการเปลี่ยนสถานะบิล
- **payment_information** - การแจ้งชำระเงิน (polymorphic: payable_type + payable_id)
- **bill_transaction_information** - รายการชำระเงินจริง (manual + auto from payment approval)
- **bill_transaction_type_information** - ประเภทการชำระเงิน (เงินสด, โอน, ฯลฯ)
- **room_information** - ข้อมูลห้องพัก
- **member_information** - ข้อมูลสมาชิก (owner, tenant)
- **bank_information** - บัญชีธนาคาร (unique: bank_no + customer_id)
- **news_information** - ข่าวสาร
- **news_category** - หมวดหมู่ข่าว
- **payment_type_information** - ประเภทการชำระเงิน (Mobile Banking, โอน, ที่นิติฯ)
- **app_config** - System configuration (runtime config)
- **notification_audit_information** - ประวัติการส่งการแจ้งเตือน

### Dynamic Attachment Tables
- **{menu}_attachment** - แนบไฟล์ (news, bill, payment) - Auto-created per module

### Key Relationships
```
bill_information (1) ──< (N) bill_room_information
bill_room_information (1) ──< (N) bill_transaction_information
payment_information (N) ──> (1) bill_room_information (polymorphic)
room_information (1) ──< (N) member_information
bill_information (N) ──> (1) bill_type_information
```

---

## 7. Data Flow Examples

### 7.1 Bill Creation Flow (Excel Import)
```
1. Upload Excel → bill_attachment (upload_key)
2. Preview → GET /api/bill/bill_excel_list (validate rows)
3. User excludes invalid rows → excluded_rows array
4. Insert → POST /api/bill/insert_with_excel
   ├─ Create bill_information (auto bill_no: BILL-YYYY-MMDD-NNN)
   ├─ Batch insert bill_room_information (auto bill_no: INV-YYYY-MMDD-NNN)
   └─ Insert bill_audit_information (status=0 or 1)
5. Send → POST /api/bill/send (status: 0 → 1, send_date = NOW())
   └─ Insert bill_audit_information (status=1)
6. Send Notification → POST /api/bill/send_notification_each
   └─ Insert notification_audit_information (per bill_room)
```

### 7.2 Payment Approval Flow
```
1. Member submits payment:
   ├─ Upload slip → payment_attachment (upload_key)
   └─ POST /api/payment/insert
       ├─ Validate: payment_attachment exists with status=1
       ├─ Insert payment_information (status=0, payable_type='bill_room_information')
       └─ Update bill_room_information.status = 5 (รอตรวจสอบ)

2. Admin approves payment:
   └─ PUT /api/payment/update (ids: [1,2,3], status: 1)
       ├─ Validate: all payments have status=0
       ├─ Update payment_information.status = 1
       ├─ Insert bill_transaction_information (payment_id, transaction_amount)
       ├─ Calculate total_paid = SUM(transaction_amount)
       └─ Update bill_room_information.status:
           ├─ If total_paid >= total_price → status=1 (ชำระแล้ว)
           └─ If total_paid < total_price → status=4 (ชำระบางส่วน)

3. Admin rejects payment:
   └─ PUT /api/payment/update (ids: [4], status: 3, remark: "...")
       ├─ Update payment_information.status = 3
       └─ Update bill_room_information.status = 0 (รอชำระ)
```

### 7.3 Authentication Flow
```
1. User login via Portal:
   └─ POST /api/auth/login { username, password }
       ├─ Forward to Portal API: POST /api/login
       ├─ Portal validates credentials
       └─ Return JWT token

2. Subsequent API calls:
   └─ Include: Authorization: Bearer <JWT>
       ├─ authenticateJWT middleware: Verify JWT, decode user info
       ├─ verifyCustomerAccess middleware: Check customer_id permission
       │   ├─ GET Portal API: /api/user/{userId}/{userLevel}/allow_sites
       │   ├─ Get k_product_customer_name from allowed sites
       │   ├─ Query Firebase: customer WHERE name = k_product_customer_name
       │   └─ Extract customer_code → this is customer_id
       └─ Controller: Process request
```

---

## 8. Configuration & Deployment

### 8.1 Environment Variables (.env)
```
# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=kconnect

# Server
PORT=3000
NODE_ENV=development
DOMAIN=http://localhost:3000

# Portal SSO
PORTAL_API_URL=https://portal-api.example.com

# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n

# Upload
UPLOAD_TYPE=firebase  # or 'project' for local storage
```

### 8.2 Runtime Configuration (app_config table)
- `max_file_size` - 10 (MB)
- `max_file_count` - 5 (files per upload_key)
- `allowed_file_types` - ["jpeg","jpg","png","gif","pdf","doc","docx","xlsx","xls","csv"]
- `notification_resend_interval_minutes` - 30 (minutes)

### 8.3 Deployment Environments

**Local Development:**
- Database: localhost MySQL
- Port: 3000 (or 3002, 3003 for testing)
- Upload: Local storage (`uploads/` folder)
- Logs: `logs/` folder

**Production (Railway):**
- Database: Railway private network (mysql.railway.internal)
- Port: Auto-assigned by Railway (listen on 0.0.0.0)
- Upload: Firebase Storage
- Environment: Set via Railway dashboard
- Logs: Winston daily rotation

### 8.4 Development Commands
```bash
npm install              # Install dependencies
npm run dev             # Start with nodemon (auto-reload)
npm start               # Production start
```

---

## 9. Business Rules

### 9.1 Bill Status Workflow
- **0 (Draft)**: บิลยังไม่ส่ง - สามารถแก้ไข/ลบได้
- **1 (Sent)**: บิลถูกส่งแล้ว - send_date = NOW()
- **2 (Deleted)**: Soft delete - ไม่แสดงในระบบ
- **3 (Canceled)**: ยกเลิกบิลที่ส่งแล้ว - send_date = NULL

**Valid Transitions:**
- 0 → 1 (send)
- 1 → 3 (cancel_send)
- 3 → 1 (resend)
- Any → 2 (delete)

### 9.2 Bill Room Status Workflow
- **0 (รอชำระ)**: Unpaid
- **1 (ชำระแล้ว)**: Fully paid
- **2 (Deleted)**: Soft delete
- **3 (เกินกำหนด)**: Overdue (dynamic: status=0 AND current_date > expire_date)
- **4 (ชำระบางส่วน)**: Partial payment
- **5 (รอตรวจสอบ)**: Pending payment verification

**Auto Status Updates:**
- Payment insert → status = 5
- Payment approved → status = 1 or 4 (based on total_paid vs total_price)
- Payment rejected → status = 0

### 9.3 Payment Status Workflow
- **0 (Pending)**: รออนุมัติ - ยังแก้ไขได้
- **1 (Approved)**: อนุมัติแล้ว - ห้ามแก้ไข
- **2 (Deleted)**: Soft delete
- **3 (Rejected)**: ปฏิเสธ - ห้ามแก้ไข, ต้องส่งใหม่

**Update Rules:**
- Only status=0 can be updated to 1 or 3
- status=3 requires remark (reason for rejection)
- Bulk update support: multiple IDs in single request

### 9.4 Bank Account Rules
- Insert: Always set status=0 (inactive) regardless of input
- Update to status=1: Check no other active bank for same customer_id
- Only one active bank per customer allowed

### 9.5 Auto-Generated Fields
- **bill_information.bill_no**: BILL-YYYY-MMDD-NNN (resets daily)
- **bill_room_information.bill_no**: INV-YYYY-MMDD-NNN (resets daily)
- **send_date**: Auto-set when status → 1
- Uses FOR UPDATE lock to prevent race conditions

### 9.6 Notification Throttling
- Interval configurable via `notification_resend_interval_minutes` (default: 30 min)
- `can_send_notification` = 1 if:
  - Never sent before, OR
  - Last notification >= interval minutes ago
- `remaining_minutes` = interval - minutes_since_last_notification

---

## 10. Testing Requirements

### 10.1 Test Data Endpoints
- `GET /api/test-data/insert_data` - Insert random test data
- `GET /api/test-data/create_*` - Create individual tables
- `GET /api/test-data/clear_tables` - Clear all data (DANGEROUS)

### 10.2 Test Scenarios
1. **Authentication**: Portal SSO login flow
2. **Excel Import**: Upload → Preview → Insert with excluded rows
3. **Payment Approval**: Submit → Approve (partial → full payment)
4. **Bill Status**: Draft → Send → Cancel → Resend
5. **Bank Single Active**: Update multiple banks to active (should fail)
6. **Notification Throttling**: Send notification twice within interval (should block)
7. **Concurrent Bill Creation**: Race condition test (bill_no should be sequential)

---

## 11. Known Limitations & Future Enhancements

### 11.1 Current Limitations
- Single database connection (not connection pool yet)
- No automated backup system
- No rate limiting on API endpoints
- PDF generation is synchronous (may be slow for large data)

### 11.2 Future Enhancements
- WebSocket for real-time notifications
- Email notification support
- QR Code payment integration (PromptPay)
- Advanced reporting (Excel export for all modules)
- Multi-language support
- Mobile app push notification history
- Automated bill scheduling (monthly recurring bills)

---

## 12. Glossary

| Term | Definition |
|------|------------|
| **Portal SSO** | Single Sign-On system ที่ใช้ authenticate ผู้ใช้ทั้งหมด |
| **JWT** | JSON Web Token สำหรับ authentication |
| **Soft Delete** | การลบข้อมูลโดยตั้งค่า status=2 แทนการลบจริง |
| **upload_key** | 32-character key สำหรับเชื่อมโยงไฟล์กับข้อมูล |
| **Firebase FCM** | Firebase Cloud Messaging สำหรับส่ง push notification |
| **Polymorphic Association** | payment_information รองรับ payable_type หลายประเภท |
| **Bill Audit Trail** | ประวัติการเปลี่ยนสถานะบิลทั้งหมด |
| **Notification Throttling** | จำกัดการส่งการแจ้งเตือนซ้ำภายในเวลาที่กำหนด |
| **Race Condition** | สถานการณ์ที่หลาย request พยายามสร้าง bill_no พร้อมกัน |
| **FOR UPDATE Lock** | Database row lock เพื่อป้องกัน race condition |

---

## 13. References

- **CLAUDE.md**: Detailed project documentation and development guide
- **API Documentation**: `/` root endpoint returns available API endpoints
- **Portal SSO API**: Provided by Portal system team
- **Firebase Admin SDK**: https://firebase.google.com/docs/admin/setup
- **MySQL Documentation**: https://dev.mysql.com/doc/

---

**Document Control:**
- **Created by**: Claude Code
- **Approved by**: Development Team
- **Next Review Date**: March 2026

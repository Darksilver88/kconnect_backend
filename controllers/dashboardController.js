import { getDatabase } from '../config/database.js';
import logger from '../utils/logger.js';
import { formatPrice } from '../utils/numberFormatter.js';

/**
 * Get dashboard summary data
 * GET /api/dashboard/summary?customer_id=xxx
 */
export const getSummary = async (req, res) => {
  try {
    const { customer_id } = req.query;

    // Validate required fields
    if (!customer_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณาระบุ customer_id',
        required: ['customer_id']
      });
    }

    const db = getDatabase();

    // Card 1: จำนวนห้องทั้งหมด (total rooms)
    const [roomRows] = await db.execute(
      `SELECT COUNT(*) as total_rooms FROM room_information WHERE customer_id = ? AND status != 2`,
      [customer_id]
    );
    const total_rooms = roomRows[0].total_rooms;

    // Card 2: ลูกบ้านที่ใช้งาน (active members) + เดือนนี้
    const [memberRows] = await db.execute(
      `SELECT COUNT(*) as active_members FROM member_information WHERE customer_id = ? AND status = 1`,
      [customer_id]
    );
    const active_members = memberRows[0].active_members;

    // นับลูกบ้านที่เพิ่มเดือนนี้
    const [newMembersRows] = await db.execute(
      `SELECT COUNT(*) as new_members
       FROM member_information
       WHERE customer_id = ?
       AND status = 1
       AND YEAR(create_date) = YEAR(CURDATE())
       AND MONTH(create_date) = MONTH(CURDATE())`,
      [customer_id]
    );
    const new_members_this_month = newMembersRows[0].new_members;

    // Card 3: ลูกบ้านใหม่ (เดือนนี้)
    const new_members = new_members_this_month;

    // Card 4: บัญชีรออนุมัติ (pending approval members)
    const [pendingRows] = await db.execute(
      `SELECT COUNT(*) as pending_members FROM member_information WHERE customer_id = ? AND status = 0`,
      [customer_id]
    );
    const pending_members = pendingRows[0].pending_members;

    // Card 5: ห้องค้างชำระ (rooms with unpaid bills) + เกินกำหนด
    const [unpaidRoomsRows] = await db.execute(
      `SELECT
         COUNT(DISTINCT br.house_no) as unpaid_rooms,
         COUNT(CASE WHEN br.status = 0 AND b.expire_date < CURDATE() THEN 1 END) as overdue_count
       FROM bill_room_information br
       LEFT JOIN bill_information b ON br.bill_id = b.id
       WHERE br.customer_id = ?
       AND br.status IN (0, 4)
       AND b.status = 1
       AND br.status != 2
       AND b.status != 2`,
      [customer_id]
    );
    const unpaid_rooms = unpaidRoomsRows[0].unpaid_rooms;
    const overdue_count = unpaidRoomsRows[0].overdue_count;

    // Card 6: รายได้เดือนนี้ (revenue this month) + เปรียบเทียบเดือนก่อน
    const [revenueRows] = await db.execute(
      `SELECT COALESCE(SUM(bt.transaction_amount), 0) as revenue_this_month
       FROM bill_transaction_information bt
       WHERE bt.customer_id = ?
       AND YEAR(bt.pay_date) = YEAR(CURDATE())
       AND MONTH(bt.pay_date) = MONTH(CURDATE())
       AND bt.status != 2`,
      [customer_id]
    );
    const revenue_this_month = parseFloat(revenueRows[0].revenue_this_month);

    // รายได้เดือนก่อน
    const [revenueLastRows] = await db.execute(
      `SELECT COALESCE(SUM(bt.transaction_amount), 0) as revenue_last_month
       FROM bill_transaction_information bt
       WHERE bt.customer_id = ?
       AND YEAR(bt.pay_date) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
       AND MONTH(bt.pay_date) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
       AND bt.status != 2`,
      [customer_id]
    );
    const revenue_last_month = parseFloat(revenueLastRows[0].revenue_last_month);
    const revenue_diff = revenue_this_month - revenue_last_month;
    const revenue_percent = revenue_last_month > 0 ? ((revenue_diff / revenue_last_month) * 100).toFixed(1) : 0;

    // Card 7: ค้างชำระ (total unpaid amount) + จำนวนรายการ
    const [unpaidRows] = await db.execute(
      `SELECT
         COALESCE(SUM(br.total_price - COALESCE(paid.total_paid, 0)), 0) as unpaid_amount,
         COUNT(br.id) as unpaid_count
       FROM bill_room_information br
       LEFT JOIN bill_information b ON br.bill_id = b.id
       LEFT JOIN (
         SELECT bill_room_id, SUM(transaction_amount) as total_paid
         FROM bill_transaction_information
         WHERE status != 2
         GROUP BY bill_room_id
       ) paid ON br.id = paid.bill_room_id
       WHERE br.customer_id = ?
       AND br.status IN (0, 4)
       AND b.status = 1
       AND br.status != 2
       AND b.status != 2`,
      [customer_id]
    );
    const unpaid_amount = parseFloat(unpaidRows[0].unpaid_amount);
    const unpaid_count = unpaidRows[0].unpaid_count;

    // Card 8: ชำระแล้ว (paid bills this month) + จำนวนรายการเดือนนี้
    const [paidRows] = await db.execute(
      `SELECT COUNT(*) as paid_count
       FROM bill_room_information br
       LEFT JOIN bill_information b ON br.bill_id = b.id
       WHERE br.customer_id = ?
       AND br.status = 1
       AND b.status = 1
       AND br.status != 2
       AND b.status != 2`,
      [customer_id]
    );
    const paid_count = paidRows[0].paid_count;

    // นับรายการที่ชำระเดือนนี้
    const [paidThisMonthRows] = await db.execute(
      `SELECT COUNT(DISTINCT bt.bill_room_id) as paid_this_month
       FROM bill_transaction_information bt
       WHERE bt.customer_id = ?
       AND YEAR(bt.pay_date) = YEAR(CURDATE())
       AND MONTH(bt.pay_date) = MONTH(CURDATE())
       AND bt.status != 2`,
      [customer_id]
    );
    const paid_this_month = paidThisMonthRows[0].paid_this_month;

    // Card 9: รอตรวจสอบ (pending payment approval)
    const [pendingPaymentRows] = await db.execute(
      `SELECT COUNT(*) as pending_payment FROM payment_information WHERE customer_id = ? AND status = 0`,
      [customer_id]
    );
    const pending_payment = pendingPaymentRows[0].pending_payment;

    // Card 10: บิลในระบบ (active bills) + เดือนนี้
    const [billRows] = await db.execute(
      `SELECT COUNT(*) as total_bills FROM bill_information WHERE customer_id = ? AND status = 1`,
      [customer_id]
    );
    const total_bills = billRows[0].total_bills;

    // นับบิลที่สร้างเดือนนี้
    const [billThisMonthRows] = await db.execute(
      `SELECT COUNT(*) as bills_this_month
       FROM bill_information
       WHERE customer_id = ?
       AND status = 1
       AND YEAR(create_date) = YEAR(CURDATE())
       AND MONTH(create_date) = MONTH(CURDATE())`,
      [customer_id]
    );
    const bills_this_month = billThisMonthRows[0].bills_this_month;

    res.json({
      success: true,
      data: {
        // การเข้าพักและสถานะบ้าน
        total_rooms: {
          value: total_rooms,
          label: 'จำนวนห้องทั้งหมด',
          change: 'ไม่เปลี่ยนแปลง'
        },
        active_members: {
          value: active_members,
          label: 'ลูกบ้านที่ใช้งาน',
          change: `+${new_members_this_month} เดือนนี้`,
          trend: 'up'
        },
        new_members: {
          value: new_members,
          label: 'ลูกบ้านใหม่',
          change: 'เดือนนี้',
          trend: 'up'
        },
        pending_members: {
          value: pending_members,
          label: 'บัญชีรออนุมัติ',
          change: 'รอดำเนินการ'
        },
        unpaid_rooms: {
          value: unpaid_rooms,
          label: 'ห้องค้างชำระ',
          change: `${overdue_count} เกินกำหนด`,
          trend: 'down'
        },

        // การเงินและการชำระเงิน
        revenue_this_month: {
          value: formatPrice(revenue_this_month),
          value_raw: revenue_this_month,
          label: 'รายได้เดือนนี้',
          change: `${revenue_diff >= 0 ? '+' : ''}${formatPrice(revenue_diff)} (${revenue_percent}%)`,
          trend: revenue_diff >= 0 ? 'up' : 'down'
        },
        unpaid_amount: {
          value: formatPrice(unpaid_amount),
          value_raw: unpaid_amount,
          label: 'ค้างชำระ',
          change: `${unpaid_count} รายการ`,
          trend: 'down'
        },
        paid_count: {
          value: paid_count,
          label: 'ชำระแล้ว',
          change: `+${paid_this_month} รายการ`,
          trend: 'up'
        },
        pending_payment: {
          value: pending_payment,
          label: 'รอตรวจสอบ',
          change: 'ต้องดำเนินการ'
        },
        total_bills: {
          value: total_bills,
          label: 'บิลในระบบ',
          change: `+${bills_this_month} เดือนนี้`,
          trend: 'up'
        }
      }
    });

  } catch (error) {
    logger.error('Error getting dashboard summary:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูล Dashboard'
    });
  }
};

/**
 * Get billing revenue chart data
 * GET /api/dashboard/billing_revenue?customer_id=xxx&month_duration=6
 */
export const getBillingRevenue = async (req, res) => {
  try {
    const { customer_id, month_duration = 6 } = req.query;

    // Validate required fields
    if (!customer_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณาระบุ customer_id',
        required: ['customer_id']
      });
    }

    // Validate month_duration
    const duration = parseInt(month_duration);
    if (![3, 6, 12].includes(duration)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid month_duration',
        message: 'month_duration ต้องเป็น 3, 6 หรือ 12 เท่านั้น',
      });
    }

    const db = getDatabase();

    // Thai month names (short)
    const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

    // สร้าง array สำหรับเก็บข้อมูลแต่ละเดือน
    const chartData = [];

    // Loop ย้อนหลังตาม duration
    for (let i = duration - 1; i >= 0; i--) {
      // คำนวณ year และ month ย้อนหลัง
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() - i);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth() + 1; // 1-12

      // ค่าเรียกเก็บ (total billed amount) - ยอดรวมจาก bill_room_information
      const [billedRows] = await db.execute(
        `SELECT COALESCE(SUM(br.total_price), 0) as billed_amount
         FROM bill_room_information br
         LEFT JOIN bill_information b ON br.bill_id = b.id
         WHERE br.customer_id = ?
         AND YEAR(b.create_date) = ?
         AND MONTH(b.create_date) = ?
         AND b.status = 1
         AND br.status != 2
         AND b.status != 2`,
        [customer_id, year, month]
      );
      const billed_amount = parseFloat(billedRows[0].billed_amount);

      // รายรับจริง (actual revenue) - ยอดรวมจาก bill_transaction_information
      const [revenueRows] = await db.execute(
        `SELECT COALESCE(SUM(bt.transaction_amount), 0) as revenue_amount
         FROM bill_transaction_information bt
         WHERE bt.customer_id = ?
         AND YEAR(bt.pay_date) = ?
         AND MONTH(bt.pay_date) = ?
         AND bt.status != 2`,
        [customer_id, year, month]
      );
      const revenue_amount = parseFloat(revenueRows[0].revenue_amount);

      // เพิ่มข้อมูลเข้า array
      chartData.push({
        month: thaiMonths[month - 1], // แปลงเป็นชื่อเดือนภาษาไทย
        month_number: month,
        year: year,
        billed: billed_amount,
        billed_formatted: formatPrice(billed_amount),
        revenue: revenue_amount,
        revenue_formatted: formatPrice(revenue_amount)
      });
    }

    res.json({
      success: true,
      data: {
        month_duration: duration,
        chart_data: chartData
      }
    });

  } catch (error) {
    logger.error('Error getting billing revenue data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลค่าเรียกเก็บและรายรับ'
    });
  }
};

/**
 * Get bill status and upcoming bills
 * GET /api/dashboard/bill_status?customer_id=xxx
 */
export const getBillStatus = async (req, res) => {
  try {
    const { customer_id } = req.query;

    // Validate required fields
    if (!customer_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณาระบุ customer_id',
        required: ['customer_id']
      });
    }

    const db = getDatabase();

    // ===== สถานะบิล (Bill Status) =====

    // นับบิลทั้งหมด
    const [totalBillsRows] = await db.execute(
      `SELECT COUNT(*) as total_bills
       FROM bill_room_information br
       LEFT JOIN bill_information b ON br.bill_id = b.id
       WHERE br.customer_id = ?
       AND b.status = 1
       AND br.status != 2
       AND b.status != 2`,
      [customer_id]
    );
    const total_bills = totalBillsRows[0].total_bills;

    // นับบิลที่ชำระแล้ว (status = 1)
    const [paidBillsRows] = await db.execute(
      `SELECT COUNT(*) as paid_bills
       FROM bill_room_information br
       LEFT JOIN bill_information b ON br.bill_id = b.id
       WHERE br.customer_id = ?
       AND br.status = 1
       AND b.status = 1
       AND br.status != 2
       AND b.status != 2`,
      [customer_id]
    );
    const paid_bills = paidBillsRows[0].paid_bills;

    // นับบิลรอชำระ (status = 0 หรือ 4 แต่ยังไม่เกินกำหนด)
    const [pendingBillsRows] = await db.execute(
      `SELECT COUNT(*) as pending_bills
       FROM bill_room_information br
       LEFT JOIN bill_information b ON br.bill_id = b.id
       WHERE br.customer_id = ?
       AND br.status IN (0, 4)
       AND b.expire_date >= CURDATE()
       AND b.status = 1
       AND br.status != 2
       AND b.status != 2`,
      [customer_id]
    );
    const pending_bills = pendingBillsRows[0].pending_bills;

    // นับบิลเกินกำหนด (status = 0 หรือ 4 และเกินกำหนดแล้ว)
    const [overdueBillsRows] = await db.execute(
      `SELECT COUNT(*) as overdue_bills
       FROM bill_room_information br
       LEFT JOIN bill_information b ON br.bill_id = b.id
       WHERE br.customer_id = ?
       AND br.status IN (0, 4)
       AND b.expire_date < CURDATE()
       AND b.status = 1
       AND br.status != 2
       AND b.status != 2`,
      [customer_id]
    );
    const overdue_bills = overdueBillsRows[0].overdue_bills;

    // คำนวณเปอร์เซ็นต์
    const paid_percent = total_bills > 0 ? Math.round((paid_bills / total_bills) * 100) : 0;
    const pending_percent = total_bills > 0 ? Math.round((pending_bills / total_bills) * 100) : 0;
    const overdue_percent = total_bills > 0 ? Math.round((overdue_bills / total_bills) * 100) : 0;

    // ===== บิลที่กำลังจะครบกำหนด (7 วันข้างหน้า) =====

    // วันพรุ่งนี้
    const [tomorrow] = await db.execute(
      `SELECT
         COUNT(*) as count,
         COALESCE(SUM(br.total_price), 0) as total_amount
       FROM bill_room_information br
       LEFT JOIN bill_information b ON br.bill_id = b.id
       WHERE br.customer_id = ?
       AND br.status IN (0, 4)
       AND DATE(b.expire_date) = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
       AND b.status = 1
       AND br.status != 2
       AND b.status != 2`,
      [customer_id]
    );

    // 2 วันข้างหน้า
    const [day2] = await db.execute(
      `SELECT
         COUNT(*) as count,
         COALESCE(SUM(br.total_price), 0) as total_amount
       FROM bill_room_information br
       LEFT JOIN bill_information b ON br.bill_id = b.id
       WHERE br.customer_id = ?
       AND br.status IN (0, 4)
       AND DATE(b.expire_date) = DATE_ADD(CURDATE(), INTERVAL 2 DAY)
       AND b.status = 1
       AND br.status != 2
       AND b.status != 2`,
      [customer_id]
    );

    // 3 วันข้างหน้า
    const [day3] = await db.execute(
      `SELECT
         COUNT(*) as count,
         COALESCE(SUM(br.total_price), 0) as total_amount
       FROM bill_room_information br
       LEFT JOIN bill_information b ON br.bill_id = b.id
       WHERE br.customer_id = ?
       AND br.status IN (0, 4)
       AND DATE(b.expire_date) = DATE_ADD(CURDATE(), INTERVAL 3 DAY)
       AND b.status = 1
       AND br.status != 2
       AND b.status != 2`,
      [customer_id]
    );

    // 4-7 วันข้างหน้า
    const [day4to7] = await db.execute(
      `SELECT
         COUNT(*) as count,
         COALESCE(SUM(br.total_price), 0) as total_amount
       FROM bill_room_information br
       LEFT JOIN bill_information b ON br.bill_id = b.id
       WHERE br.customer_id = ?
       AND br.status IN (0, 4)
       AND DATE(b.expire_date) BETWEEN DATE_ADD(CURDATE(), INTERVAL 4 DAY) AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
       AND b.status = 1
       AND br.status != 2
       AND b.status != 2`,
      [customer_id]
    );

    // สร้างวันที่แสดงผล (DD/MM)
    const formatDate = (daysAhead) => {
      const date = new Date();
      date.setDate(date.getDate() + daysAhead);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return `${day}/${month}`;
    };

    res.json({
      success: true,
      data: {
        // สถานะบิล
        bill_status: {
          total_bills: total_bills,
          paid: {
            count: paid_bills,
            percent: paid_percent
          },
          pending: {
            count: pending_bills,
            percent: pending_percent
          },
          overdue: {
            count: overdue_bills,
            percent: overdue_percent
          }
        },

        // บิลที่กำลังจะครบกำหนด
        upcoming_bills: [
          {
            label: `วันพรุ่งนี้ (${formatDate(1)})`,
            date: formatDate(1),
            count: tomorrow[0].count,
            total_amount: parseFloat(tomorrow[0].total_amount),
            total_amount_formatted: formatPrice(tomorrow[0].total_amount)
          },
          {
            label: `2 วันข้างหน้า (${formatDate(2)})`,
            date: formatDate(2),
            count: day2[0].count,
            total_amount: parseFloat(day2[0].total_amount),
            total_amount_formatted: formatPrice(day2[0].total_amount)
          },
          {
            label: `3 วันข้างหน้า (${formatDate(3)})`,
            date: formatDate(3),
            count: day3[0].count,
            total_amount: parseFloat(day3[0].total_amount),
            total_amount_formatted: formatPrice(day3[0].total_amount)
          },
          {
            label: '4-7 วันข้างหน้า',
            date: null,
            count: day4to7[0].count,
            total_amount: parseFloat(day4to7[0].total_amount),
            total_amount_formatted: formatPrice(day4to7[0].total_amount)
          }
        ]
      }
    });

  } catch (error) {
    logger.error('Error getting bill status data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลสถานะบิล'
    });
  }
};

/**
 * Get payment efficiency (ประสิทธิภาพการชำระ)
 * GET /api/dashboard/payment_efficiency?customer_id=xxx
 */
export const getPaymentEfficiency = async (req, res) => {
  try {
    const { customer_id } = req.query;

    // Validate required fields
    if (!customer_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณาระบุ customer_id',
        required: ['customer_id']
      });
    }

    const db = getDatabase();

    // นับบิลทั้งหมดของเดือนนี้ (ที่ส่งแล้ว status = 1)
    const [totalBillsRows] = await db.execute(
      `SELECT COUNT(*) as total_bills
       FROM bill_room_information br
       LEFT JOIN bill_information b ON br.bill_id = b.id
       WHERE br.customer_id = ?
       AND b.status = 1
       AND YEAR(b.send_date) = YEAR(CURDATE())
       AND MONTH(b.send_date) = MONTH(CURDATE())
       AND br.status != 2
       AND b.status != 2`,
      [customer_id]
    );
    const total_bills_this_month = totalBillsRows[0].total_bills;

    // นับบิลที่ชำระแล้วของเดือนนี้
    const [paidBillsRows] = await db.execute(
      `SELECT COUNT(*) as paid_bills
       FROM bill_room_information br
       LEFT JOIN bill_information b ON br.bill_id = b.id
       WHERE br.customer_id = ?
       AND br.status = 1
       AND b.status = 1
       AND YEAR(b.send_date) = YEAR(CURDATE())
       AND MONTH(b.send_date) = MONTH(CURDATE())
       AND br.status != 2
       AND b.status != 2`,
      [customer_id]
    );
    const paid_bills_this_month = paidBillsRows[0].paid_bills;

    // คำนวณอัตราการชำระเดือนนี้
    const payment_rate_this_month = total_bills_this_month > 0
      ? ((paid_bills_this_month / total_bills_this_month) * 100).toFixed(1)
      : 0;

    // นับบิลทั้งหมดของเดือนก่อน
    const [totalBillsLastRows] = await db.execute(
      `SELECT COUNT(*) as total_bills
       FROM bill_room_information br
       LEFT JOIN bill_information b ON br.bill_id = b.id
       WHERE br.customer_id = ?
       AND b.status = 1
       AND YEAR(b.send_date) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
       AND MONTH(b.send_date) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
       AND br.status != 2
       AND b.status != 2`,
      [customer_id]
    );
    const total_bills_last_month = totalBillsLastRows[0].total_bills;

    // นับบิลที่ชำระแล้วของเดือนก่อน
    const [paidBillsLastRows] = await db.execute(
      `SELECT COUNT(*) as paid_bills
       FROM bill_room_information br
       LEFT JOIN bill_information b ON br.bill_id = b.id
       WHERE br.customer_id = ?
       AND br.status = 1
       AND b.status = 1
       AND YEAR(b.send_date) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
       AND MONTH(b.send_date) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
       AND br.status != 2
       AND b.status != 2`,
      [customer_id]
    );
    const paid_bills_last_month = paidBillsLastRows[0].paid_bills;

    // คำนวณอัตราการชำระเดือนก่อน
    const payment_rate_last_month = total_bills_last_month > 0
      ? ((paid_bills_last_month / total_bills_last_month) * 100).toFixed(1)
      : 0;

    // คำนวณการเปลี่ยนแปลง
    const rate_diff = (parseFloat(payment_rate_this_month) - parseFloat(payment_rate_last_month)).toFixed(1);
    const trend = parseFloat(rate_diff) >= 0 ? 'up' : 'down';

    // ตั้งเป้าหมาย 90%
    const target_rate = 90;

    // คำนวณจำนวนรายการที่ต้องการเพิ่มเพื่อบรรลุเป้าหมาย
    const current_rate = parseFloat(payment_rate_this_month);
    let needed_payments = 0;

    if (current_rate < target_rate && total_bills_this_month > 0) {
      // คำนวณจำนวนที่ต้องชำระเพิ่มเพื่อให้ถึง 90%
      const target_paid = Math.ceil((target_rate / 100) * total_bills_this_month);
      needed_payments = Math.max(0, target_paid - paid_bills_this_month);
    }

    res.json({
      success: true,
      data: {
        payment_rate: parseFloat(payment_rate_this_month),
        payment_rate_formatted: `${payment_rate_this_month}%`,
        payment_rate_last_month: parseFloat(payment_rate_last_month),
        rate_change: parseFloat(rate_diff),
        rate_change_formatted: `${rate_diff >= 0 ? '+' : ''}${rate_diff}%`,
        trend: trend,
        target_rate: target_rate,
        needed_payments: needed_payments,
        stats: {
          total_bills: total_bills_this_month,
          paid_bills: paid_bills_this_month,
          unpaid_bills: total_bills_this_month - paid_bills_this_month
        }
      }
    });

  } catch (error) {
    logger.error('Error getting payment efficiency data:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลประสิทธิภาพการชำระ'
    });
  }
};

/**
 * Get action items (รายการที่ต้องดำเนินการ)
 * GET /api/dashboard/action_items?customer_id=xxx
 */
export const getActionItems = async (req, res) => {
  try {
    const { customer_id } = req.query;

    // Validate required fields
    if (!customer_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'กรุณาระบุ customer_id',
        required: ['customer_id']
      });
    }

    const db = getDatabase();

    const actionItems = [];

    // 1. รายการรอตรวจสอบและอนุมัติการชำระเงิน
    const [pendingPaymentRows] = await db.execute(
      `SELECT COUNT(*) as count FROM payment_information WHERE customer_id = ? AND status = 0`,
      [customer_id]
    );
    const pending_payment_count = pendingPaymentRows[0].count;

    if (pending_payment_count > 0) {
      actionItems.push({
        id: 'pending_payment',
        title: `${pending_payment_count} รายการรอตรวจสอบและอนุมัติการชำระเงิน`,
        description: 'ต้องดำเนินการภายใน 24 ชั่วโมง',
        count: pending_payment_count,
        background_color: 'bg-red-100',
        border_color: 'border-l-red-500',
        icon_html: '<i class="fas fa-exclamation-circle text-2xl text-red-500 mr-4"></i>',
        icon_class: 'fas fa-exclamation-circle',
        icon_color: 'text-red-500',
        router: 'payment?tab=1',
        priority: 1
      });
    }

    // 2. บิลรอการชำระเงิน (รวมเกินกำหนด)
    // นับบิลรอชำระทั้งหมด
    const [unpaidBillsRows] = await db.execute(
      `SELECT COUNT(*) as total_unpaid
       FROM bill_room_information br
       LEFT JOIN bill_information b ON br.bill_id = b.id
       WHERE br.customer_id = ?
       AND br.status IN (0, 4)
       AND b.status = 1
       AND br.status != 2
       AND b.status != 2`,
      [customer_id]
    );
    const total_unpaid = unpaidBillsRows[0].total_unpaid;

    // นับบิลเกินกำหนด
    const [overdueBillsRows] = await db.execute(
      `SELECT COUNT(*) as overdue
       FROM bill_room_information br
       LEFT JOIN bill_information b ON br.bill_id = b.id
       WHERE br.customer_id = ?
       AND br.status IN (0, 4)
       AND b.expire_date < CURDATE()
       AND b.status = 1
       AND br.status != 2
       AND b.status != 2`,
      [customer_id]
    );
    const overdue_count = overdueBillsRows[0].overdue;

    if (total_unpaid > 0) {
      actionItems.push({
        id: 'unpaid_bills',
        title: `${total_unpaid} บิลรอการชำระเงิน${overdue_count > 0 ? ` (${overdue_count} รายการเกินกำหนด)` : ''}`,
        description: 'บางรายการควรติดตามเร่งด่วน',
        count: total_unpaid,
        overdue_count: overdue_count,
        background_color: 'bg-yellow-100',
        border_color: 'border-l-yellow-500',
        icon_html: '<i class="fas fa-clock text-2xl text-yellow-500 mr-4"></i>',
        icon_class: 'fas fa-clock',
        icon_color: 'text-yellow-500',
        router: 'payment?tab=0',
        priority: 2
      });
    }

    res.json({
      success: true,
      data: {
        total_items: actionItems.length,
        items: actionItems
      }
    });

  } catch (error) {
    logger.error('Error getting action items:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'เกิดข้อผิดพลาดในการดึงข้อมูลรายการที่ต้องดำเนินการ'
    });
  }
};

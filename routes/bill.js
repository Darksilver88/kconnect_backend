import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { insertBill, updateBill, sendBill, cancelSendBill, deleteBill, getBillDetail, getBillList, insertBillWithExcel, getBillExcelList, getBillRoomList, getBillRoomEachList, getBillRoomPendingList, getBillStatus, getSummaryData } from '../controllers/billController.js';

const router = express.Router();

// Bill routes
router.post('/insert', upload.none(), insertBill);
router.post('/insert_with_excel', upload.none(), insertBillWithExcel);
router.put('/update', upload.none(), updateBill);
router.post('/send', upload.none(), sendBill);
router.post('/cancel_send', upload.none(), cancelSendBill);
router.delete('/delete', upload.none(), deleteBill);
router.get('/get_summary_data', getSummaryData);
router.get('/bill_excel_list', getBillExcelList);
router.get('/bill_room_list', getBillRoomList);
router.get('/bill_room_each_list', getBillRoomEachList);
router.get('/bill_room_pending_list', getBillRoomPendingList);
router.get('/bill_status', getBillStatus);
router.get('/list', getBillList);
router.get('/:id', getBillDetail);

export default router;

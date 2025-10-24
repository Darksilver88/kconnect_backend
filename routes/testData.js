import express from 'express';
import { insertTestData, getTestDataList, createNewsAttachment, createBillAttachment, createAppConfig, createRoomInformation, createMemberInformation, createBillInformation, createBillRoomInformation, createBillTypeInformation, createBillAudit, createPaymentInformation, createPaymentAttachment, createPaymentTypeInformation, createBillTransactionInformation, createBillTransactionTypeInformation } from '../controllers/testDataController.js';

const router = express.Router();

// router.post('/insert_data', insertTestData);
router.get('/insert_data', insertTestData);
router.get('/list_data', getTestDataList);
router.get('/create_news_attachment', createNewsAttachment);
router.get('/create_bill_attachment', createBillAttachment);
router.get('/create_app_config', createAppConfig);
router.get('/create_room_information', createRoomInformation);
router.get('/create_member_information', createMemberInformation);
router.get('/create_bill_information', createBillInformation);
router.get('/create_bill_room_information', createBillRoomInformation);
router.get('/create_bill_type_information', createBillTypeInformation);
router.get('/create_bill_audit', createBillAudit);
router.get('/create_payment_information', createPaymentInformation);
router.get('/create_payment_attachment', createPaymentAttachment);
router.get('/create_payment_type_information', createPaymentTypeInformation);
router.get('/create_bill_transaction_information', createBillTransactionInformation);
router.get('/create_bill_transaction_type_information', createBillTransactionTypeInformation);

export default router;
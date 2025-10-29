import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { uploadFiles, deleteFile } from '../controllers/uploadController.js';
import testDataRoutes from './testData.js';
import newsRoutes from './news.js';
import roomRoutes from './room.js';
import memberRoutes from './member.js';
import billRoutes from './bill.js';
import billTypeRoutes from './billType.js';
import billRoomRoutes from './billRoom.js';
import billTransactionRoutes from './billTransaction.js';
import paymentRoutes from './payment.js';
import paymentTypeRoutes from './paymentType.js';
import dashboardRoutes from './dashboard.js';

const router = express.Router();

router.get('/test', (req, res) => {
  res.json({
    message: 'API is working',
    timestamp: new Date().toISOString()
  });
});

// File upload/delete endpoints
router.post('/upload_file', upload.array('files'), uploadFiles);
router.delete('/delete_file', upload.none(), deleteFile);

router.use('/test-data', testDataRoutes);
router.use('/news', newsRoutes);
router.use('/room', roomRoutes);
router.use('/member', memberRoutes);
router.use('/bill', billRoutes);
router.use('/bill_type', billTypeRoutes);
router.use('/bill_room', billRoomRoutes);
router.use('/bill_transaction', billTransactionRoutes);
router.use('/payment', paymentRoutes);
router.use('/payment_type', paymentTypeRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;
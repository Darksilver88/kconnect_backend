import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { uploadFiles, deleteFile } from '../controllers/uploadController.js';
import testDataRoutes from './testData.js';
import newsRoutes from './news.js';

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

export default router;
import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { insertMember, getMemberList, getMemberDetail } from '../controllers/memberController.js';

const router = express.Router();

// Member routes
router.post('/insert', upload.none(), insertMember);
router.get('/list', getMemberList);
router.get('/:id', getMemberDetail);

export default router;

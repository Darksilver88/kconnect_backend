import express from 'express';
import { getBillTypeList } from '../controllers/billTypeController.js';

const router = express.Router();

// Bill Type routes
router.get('/list', getBillTypeList);

export default router;

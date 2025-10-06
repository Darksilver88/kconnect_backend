import express from 'express';
import { upload } from '../utils/fileUpload.js';
import { insertNews, updateNews, deleteNews, getNewsList, getNewsById, insertCategory, updateCategory, deleteCategory, getCategoryList } from '../controllers/newsController.js';

const router = express.Router();

// News routes
router.post('/insert', upload.none(), insertNews);
router.put('/update', upload.none(), updateNews);
router.delete('/delete', upload.none(), deleteNews);
router.get('/list', getNewsList);

// Category routes (must be before /:id route)
router.post('/insert_category', upload.none(), insertCategory);
router.put('/update_category', upload.none(), updateCategory);
router.delete('/delete_category', upload.none(), deleteCategory);
router.get('/list_category', getCategoryList);

// Dynamic route must be last
router.get('/:id', getNewsById);

export default router;
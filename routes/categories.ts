import { Router, Request, Response } from 'express';
import Category from '../models/Category';
import { authenticateJWT } from '../middlewares/authMiddleware';
import checkAccess from '../middlewares/accessMiddleware';

const router = Router();
router.use(authenticateJWT);

router.get('/:userid',checkAccess("config","read"),async (req: Request, res: Response) => {
    try {
      const { userid } = req.params;
      const categories = await Category.find({user_id : userid});
      res.status(200).json(categories);
    } catch (error) {
      res.status(500).json({ error });
    }
});

// GET /api/categories
// router.get('/:id', async (req: Request, res: Response) => {
//   try {
//     const categories = await Category.findby();
//     res.status(200).json(categories);
//   } catch (error) {
//     res.status(500).json({ error });
//   }
// });

// POST /api/categories
router.post('/',checkAccess("config","create"), async (req: Request, res: Response) => {
  try {
    const newCategory = new Category(req.body);
    await newCategory.save();
    res.status(201).json(newCategory);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// PUT /api/categories
router.put('/', async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    console.log("updated Data",req.body?.formData)
    const updatedCategory = await Category.findByIdAndUpdate(id, req.body?.formData, { new: true });
    res.status(200).json(updatedCategory);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// DELETE /api/categories
router.delete('/', async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    await Category.findByIdAndDelete(id);
    res.status(200).json({ message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ error });
  }
});

export default router;

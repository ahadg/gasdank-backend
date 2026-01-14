import { Router, Request, Response } from 'express';
import Category from '../models/Category';
import { authenticateJWT } from '../middlewares/authMiddleware';
import checkAccess from '../middlewares/accessMiddleware';
import User from '../models/User';

const router = Router();
router.use(authenticateJWT);

router.get('/:userid', checkAccess("config.categories", "read"), async (req: Request, res: Response) => {
  try {
    const { userid } = req.params;
    const user: any = await User.findById(userid);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const adminId = (user.role === 'admin' || user.role === 'superadmin') ? user._id : (user.created_by || user._id);

    const usersUnderAdmin = await User.find({ created_by: adminId, deleted_at: null });
    const userIds = [adminId, ...usersUnderAdmin.map(u => u._id)];

    const categories = await Category.find({ user_id: { $in: userIds } });
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ error });
  }
});


// POST /api/categories
router.post('/', checkAccess("config.categories", "create"), async (req: Request, res: Response) => {
  try {
    const newCategory = new Category(req.body);
    await newCategory.save();
    res.status(201).json(newCategory);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// PUT /api/categories
router.put('/', checkAccess("config.categories", "edit"), async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    console.log("updated Data", req.body?.formData)
    const updatedCategory = await Category.findByIdAndUpdate(id, req.body?.formData, { new: true });
    res.status(200).json(updatedCategory);
  } catch (error) {
    res.status(500).json({ error });
  }
});

// DELETE /api/categories
router.delete('/', checkAccess("config.categories", "delete"), async (req: Request, res: Response) => {
  try {
    const { id } = req.body;
    await Category.findByIdAndDelete(id);
    res.status(200).json({ message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ error });
  }
});

export default router;
